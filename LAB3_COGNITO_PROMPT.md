# Lab 3: AWS Serverless Migration & Cognito Authentication (Email + Password + Google OAuth)

> **Призначення документа:** Комплексний файл-промт та інструкція з виконання лабораторної роботи №3. Містить чітке розділення завдань на **те, що має зробити людина (Manual / Human Tasks)**, і **те, що має імплементувати AI-агент (Agent Tasks)**, а також детальний аналіз архітектури кодової бази `OneTwoThree` та вичерпні відповіді на запитання для захисту.

---

## 1. Аналіз поточного стану проєкту `OneTwoThree`

Проєкт являє собою додаток для планування зустрічей (**Meetings Scheduler**), переведений на безсерверний стек AWS (us-east-1).

### Архітектурний контекст (Stage 2 Serverless):
- **Frontend:** SPA на React 19 + TypeScript + Vite + Tailwind CSS + Lucide + TanStack Query + React Router v7. Збирається в статику (`dist/`), деплоїться в приватний S3-бакет за CloudFront OAC на безкоштовному тарифі **CloudFront Free Plan** із WAF.
- **Backend:** FastAPI на Python 3.12, запускається як контейнер в **AWS Lambda** через адаптер **Mangum** (`back/app/lambda_handler.py`), викликається безпосередньо через **Lambda Function URL** (HTTPS).
- **Database:** **Aurora Serverless v2 PostgreSQL** (0–1 ACU), розміщена в VPC, налаштована на паузу через 5 хвилин простою (`SecondsUntilAutoPause: 300`).
- **Мережа та безпека:** Lambda знаходиться в VPC для доступу до Aurora, але **не має NAT Gateway** (економія ~$33/міс). Отже, Lambda **не має виходу в публічний інтернет** під час виконання запитів!
- **Auth (Cognito):** Аутентифікація реалізується через **Amazon Cognito User Pool**.

### Що вже є в проєкті:
1. `back/app/auth.py` та `back/app/config.py`:
   - Реалізовано локальну перевірку JWT (RS256) через JWKS.
   - Оскільки Lambda не має NAT Gateway, публічні ключі пулу передаються через параметр `CognitoJwks` / змінну середовища `COGNITO_JWKS` під час деплою через `Makefile`.
   - Ендпоінти захищені залежністю `get_current_user`, яка витягує `sub`, `email`, `name` і автоматично створює/синхронізує користувача в таблиці `users` PostgreSQL (`app/services/users.py`).
2. `infra/cognito.yaml`:
   - Створено початковий шаблон CloudFormation для UserPool, UserPoolClient, UserPoolDomain, GoogleIdentityProvider.
3. `Makefile`:
   - Наявні цілі `aws-cognito-stack`, `aws-cognito-deploy`, `aws-cognito-env`, `aws-backend-stack`, `aws-frontend-publish`, `aws-deploy`.

### Що розходиться з вимогами Lab 3 і потребує доопрацювання:
1. **`infra/cognito.yaml`:**
   - ❌ Відсутній `UserPoolTier: ESSENTIALS` у `AWS::Cognito::UserPool` (вимога для Managed Login v2, до 10,000 MAU безкоштовно).
   - ❌ Відсутній `ManagedLoginVersion: 2` у `AWS::Cognito::UserPoolDomain`.
   - ❌ Відсутній обов'язковий ресурс `AWS::Cognito::ManagedLoginBranding` із `UseCognitoProvidedValues: true` (без нього домен версії 2 видає помилку і не відображає інтерфейс входу).
   - ❌ У `UserPoolClient` слід гарантувати явну залежність `DependsOn: GoogleIdentityProvider`, щоб клієнт не створювався раніше за провайдера.
2. **`front/` (Фронтенд):**
   - ❌ Вимога завдання: **URL для здачі — це `/login/`** (наприклад, `https://demo.your-domain.com/login/`). При переході за цим URL має відкриватися офіційна сторінка Cognito Managed Login, яка містить **одночасно і форму входу/реєстрації з email+паролем, і кнопку "Continue with Google"**. Наразі в `App.tsx` маршруту `/login` немає (є лише `/`), а сторінка `LoginPage.tsx` відображає кастомну локальну HTML-форму замість редіректу на Cognito Hosted UI.
   - ❌ У `front/src/components/SiteHeader.tsx` поле відображення користувача містить `{me.name ?? me.email}` і клас `hidden ... lg:inline`. Якщо користувач увійшов через Google, відображається його ім'я, а не email! Крім того, на планшетах/менших екранах воно приховується. А вимога завдання сувора: **"Two screenshots of your site with a user signed in (the email visible in the header): one signed in with a password, one signed in with Google."** Необхідно, щоб email був обов'язково видимим у шапці сайту!
   - ❌ Необхідно підтримувати точний Callback URL як для локальної розробки (`http://localhost:3000/auth/callback`, `http://localhost:5173/auth/callback`), так і для CloudFront-домену.

---

## 2. Що має зробити Людина (Manual Human Tasks)

Ці дії вимагають особистого входу в консолі зовнішніх провайдерів (Google Cloud, AWS), налаштування захищених секретів та фіксації підтверджень здачі.

### Крок 1. Налаштування Google Cloud Console (OAuth 2.0)
> **Час виконання:** ~15 хвилин.  
> **Мета:** Створити клієнт OAuth 2.0, щоб Cognito міг взаємодіяти з Google.

1. Увійдіть у [Google Cloud Console](https://console.cloud.google.com/).
2. Створіть новий проєкт (або оберіть існуючий), наприклад `meetings-auth`.
3. Перейдіть у розділ **Google Auth Platform** (або **APIs & Services** → **OAuth consent screen**):
   - **User Type:** оберіть **External** (Зовнішній). Натисніть *Create*.
   - **App information:** вкажіть назву додатку (наприклад, `Meetings Scheduler`), додайте свою контактну пошту (*User support email* та *Developer contact information*).
   - **Scopes:** натисніть *Add or Remove Scopes*, виберіть три базові незахищені скоупи: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Збережіть.
   - ⚠️ **КРИТИЧНО ВАЖЛИВО — Публікація додатку:**  
     У вкладці **Audience / OAuth consent screen** змініть **Publishing status** з *Testing* на **In production** (натисніть **Publish App**).  
     *Чому це критично:* Поки додаток у статусі *Testing*, увійти можуть лише тестові акаунти зі списку. Викладач отримає помилку `403 access_denied`, якщо додаток не опубліковано! Оскільки скоупи базові, верифікація від Google не потрібна.
4. Перейдіть у **Credentials** → **Create Credentials** → **OAuth client ID**:
   - **Application type:** **Web application**.
   - **Name:** наприклад `Cognito Google Auth`.
   - **Authorized JavaScript origins:**  
     `https://<prefix>.auth.us-east-1.amazoncognito.com`  
     *(Примітка: префікс обирається згідно з вашим `COGNITO_DOMAIN` або `meetings-<AWS_ACCOUNT_ID>`)*.
   - **Authorized redirect URIs:**  
     `https://<prefix>.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`  
     *(Це ендпоінт Cognito, куди Google повертає авторизаційний код)*.
5. Натисніть **Create** і збережіть отримані:
   - `Client ID` (вигляду `xxx.apps.googleusercontent.com`)
   - `Client Secret` (вигляду `GOCSPX-xxx`)

---

### Крок 2. Налаштування змінних у локальному файлі `.env`
У корені репозиторію відредагуйте `.env` (цей файл знаходиться у `.gitignore` і не повинен комітитися):

```ini
# Google OAuth клієнт
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret

# AWS креденшали
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1

# Домен фронтенду (якщо є власний домен) або залиште дефолтний CloudFront
# AWS_FRONTEND_DOMAIN=demo.your-domain.com
```

---

### Крок 3. Запуск розгортання в AWS (Deploy)
Запустіть розгортання через термінал:

```bash
# 1. Розгорнути оновлений стек Cognito (створює пул, клієнт, домен Managed Login v2 та Google IdP)
make aws-cognito-deploy

# 2. Оновити бекенд (щоб підтягнути оновлені JWKS та Cognito Pool ID)
make aws-backend-stack KEEP_IMAGE=1

# 3. Зібрати та опублікувати фронтенд (збірка з новими VITE_COGNITO_* змінними, завантаження в S3, інвалідація CloudFront)
make aws-frontend-deploy
```
*Або скористайтеся повною збіркою: `make aws-deploy`.*

---

### Крок 4. Ручне тестування ("Try it as a stranger")
Відкрийте браузер у режимі **Incognito (Private Window)**:

1. **Вхід через Email + Password:**
   - Перейдіть за посиланням `https://<ваша-сторінка-або-домен>/login/`.
   - Перевірте, що вас перенаправило на сторінку **AWS Cognito Managed Login**.
   - Натисніть **Sign up**, введіть особисту пошту та пароль (мінімум 8 символів, цифри, малі літери).
   - Отримайте одноразовий код підтвердження на пошту, введіть його.
   - Перевірте, що вас повернуло на сайт, і в шапці **чітко видно вашу пошту**.
   - Натисніть **Sign out**.
2. **Вхід через Continue with Google:**
   - Знову відкрийте нове приватне вікно та перейдіть на `https://<ваша-сторінка-або-домен>/login/`.
   - На сторінці Cognito виберіть **Continue with Google**.
   - Увійдіть під Google-акаунтом (бажано тим, який не вказаний як тестовий у GCP).
   - Перевірте, що авторизація успішна, і в шапці сайту **відображається email Google-акаунта**.
   - Перевірте в консолі AWS Cognito (Users), що з'явився новий користувач формату `google_12345...`.

---

### Крок 5. Підготовка артефактів для здачі
Підготуйте для відправки викладачу:
1. **URL сторінки логіну:** наприклад `https://demo.your-domain.com/login/` (або `https://<distrib-id>.cloudfront.net/login/`).
2. **Два скріншоти:**
   - Скріншот №1: сайт із залогіненим користувачем через пароль (email чітко видно в хедері).
   - Скріншот №2: сайт із залогіненим користувачем через Google (email Google-акаунта чітко видно в хедері).
3. **Посилання на git-коміт:** коміт у вашому репозиторії, що містить оновлений шаблон інфраструктури (`infra/cognito.yaml`) та зміни у фронтенді.

---

## 3. Що має імплементувати AI-агент (Agent Tasks)

Нижче наведено технічний опис і готовий код усіх файлів, які необхідно внести або модифікувати в кодовій базі.

### Завдання 1. Оновлення CloudFormation шаблону `infra/cognito.yaml`
**Вимоги:**
- `UserPoolTier: ESSENTIALS` для `AWS::Cognito::UserPool`.
- `ManagedLoginVersion: 2` для `AWS::Cognito::UserPoolDomain`.
- Додати ресурс `AWS::Cognito::ManagedLoginBranding` з `UseCognitoProvidedValues: true`.
- Додати `DependsOn: GoogleIdentityProvider` у `UserPoolClient` (якщо Google увімкнено) або винести клієнт із підтримкою `[COGNITO, Google]`.
- Переконатися, що `CallbackURLs` та `LogoutURLs` містять як локальні адреси, так і CloudFront/продакшн домени з урахуванням слешів.

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: >-
  Meetings App - Cognito user pool for sign-in with email and password (self sign-up, email
  verification), a public app client for the SPA, Managed Login v2, and Google Identity Provider.

Parameters:
  ProjectName:
    Type: String
    Default: meetings
    Description: Name prefix for all resources.
  CallbackUrls:
    Type: CommaDelimitedList
    Default: http://localhost:3000/auth/callback,http://localhost:5173/auth/callback
    Description: Where Cognito sends users back after sign-in.
  LogoutUrls:
    Type: CommaDelimitedList
    Default: http://localhost:3000/,http://localhost:5173/
    Description: Where Cognito sends users after signing out.
  GoogleClientId:
    Type: String
    Default: ""
    Description: OAuth client ID from Google Cloud.
  GoogleClientSecret:
    Type: String
    Default: ""
    NoEcho: true
    Description: OAuth client secret from Google Cloud.

Conditions:
  GoogleEnabled: !Not [!Equals [!Ref GoogleClientId, ""]]

Resources:
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: !Sub ${ProjectName}-users
      UserPoolTier: ESSENTIALS
      UserPoolTags:
        PROJECT_NAME: !Ref ProjectName
      UsernameAttributes: [email]
      UsernameConfiguration:
        CaseSensitive: false
      AutoVerifiedAttributes: [email]
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: false
      AccountRecoverySetting:
        RecoveryMechanisms:
          - { Name: verified_email, Priority: 1 }
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireLowercase: true
          RequireNumbers: true
          RequireUppercase: false
          RequireSymbols: false
          TemporaryPasswordValidityDays: 7
      EmailConfiguration:
        EmailSendingAccount: COGNITO_DEFAULT
      Schema:
        - { Name: email, AttributeDataType: String, Required: true, Mutable: true }
        - { Name: name, AttributeDataType: String, Required: false, Mutable: true }

  GoogleIdentityProvider:
    Type: AWS::Cognito::UserPoolIdentityProvider
    Condition: GoogleEnabled
    Properties:
      UserPoolId: !Ref UserPool
      ProviderName: Google
      ProviderType: Google
      ProviderDetails:
        client_id: !Ref GoogleClientId
        client_secret: !Ref GoogleClientSecret
        authorize_scopes: openid email profile
      AttributeMapping:
        email: email
        email_verified: email_verified
        name: name

  UserPoolDomain:
    Type: AWS::Cognito::UserPoolDomain
    Properties:
      UserPoolId: !Ref UserPool
      Domain: !Sub ${ProjectName}-${AWS::AccountId}
      ManagedLoginVersion: 2

  ManagedLoginBranding:
    Type: AWS::Cognito::ManagedLoginBranding
    DependsOn: UserPoolDomain
    Properties:
      UserPoolId: !Ref UserPool
      UseCognitoProvidedValues: true

  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    DependsOn:
      - !If [GoogleEnabled, GoogleIdentityProvider, !Ref "AWS::NoValue"]
    Properties:
      ClientName: !Sub ${ProjectName}-web
      UserPoolId: !Ref UserPool
      GenerateSecret: false
      ExplicitAuthFlows:
        - ALLOW_USER_PASSWORD_AUTH
        - ALLOW_USER_SRP_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
      PreventUserExistenceErrors: ENABLED
      EnableTokenRevocation: true
      IdTokenValidity: 60
      AccessTokenValidity: 60
      RefreshTokenValidity: 30
      TokenValidityUnits:
        IdToken: minutes
        AccessToken: minutes
        RefreshToken: days
      SupportedIdentityProviders: !If
        - GoogleEnabled
        - [COGNITO, Google]
        - [COGNITO]
      AllowedOAuthFlowsUserPoolClient: true
      AllowedOAuthFlows: [code]
      AllowedOAuthScopes: [openid, email, profile]
      CallbackURLs: !Ref CallbackUrls
      LogoutURLs: !Ref LogoutUrls

Outputs:
  UserPoolId:
    Value: !Ref UserPool
  UserPoolClientId:
    Value: !Ref UserPoolClient
  Region:
    Value: !Ref AWS::Region
  Issuer:
    Description: Issuer (iss) of the pool's tokens.
    Value: !Sub https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}
  HostedUiDomain:
    Description: Domain of the Hosted UI / Managed Login endpoints.
    Value: !Sub ${UserPoolDomain}.auth.${AWS::Region}.amazoncognito.com
  GoogleEnabled:
    Value: !If [GoogleEnabled, "true", "false"]
```

---

### Завдання 2. Оновлення фронтенду під Cognito Managed Login (`front/`)

#### 1. Модифікація `front/src/lib/auth.ts`:
Додати функцію запуску стандартного Cognito Managed Login (Hosted UI) через OAuth 2.0 Authorization Code + PKCE (без попереднього вибору Identity Provider, щоб показати як форму email/пароля, так і Google кнопку):

```typescript
export async function redirectToCognitoLogin(): Promise<void> {
  const { clientId, domain } = authConfig()
  if (!domain || !clientId) return
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)))
  const challenge = base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  )
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }))
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl(),
    scope: "openid email profile",
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  })
  window.location.assign(`https://${domain}/oauth2/authorize?${params}`)
}

export function logoutFromCognito(): void {
  const { clientId, domain } = authConfig()
  signOut()
  if (domain && clientId) {
    const logoutRedirect = encodeURIComponent(`${window.location.origin}/`)
    window.location.assign(`https://${domain}/logout?client_id=${clientId}&logout_uri=${logoutRedirect}`)
  } else {
    window.location.assign("/")
  }
}
```

#### 2. Додавання сторінки `/login` у `front/src/pages/LoginPage.tsx`:
Сторінка при вході має одразу ініціювати редірект на Cognito Managed Login, якщо налаштовано AWS Cognito, або показати кнопку переходу:

```tsx
import { useEffect } from "react"
import { LoaderCircle } from "lucide-react"
import { authConfig, redirectToCognitoLogin } from "@/lib/auth"

export function LoginPage() {
  useEffect(() => {
    const { domain, clientId } = authConfig()
    if (domain && clientId) {
      redirectToCognitoLogin()
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="flex items-center gap-3 text-lg font-medium text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin text-primary" />
        Redirecting to Cognito sign-in…
      </div>
      <button
        onClick={() => redirectToCognitoLogin()}
        className="mt-4 text-sm text-primary underline"
      >
        Click here if not redirected automatically
      </button>
    </div>
  )
}
```

#### 3. Налаштування маршрутизації в `front/src/App.tsx`:
Додати маршрути `/login` та `/login/`:

```tsx
<Route path="/login" element={<LoginPage />} />
<Route path="/login/" element={<LoginPage />} />
```

#### 4. Обов'язкове відображення Email у шапці `front/src/components/SiteHeader.tsx`:
Для того щоб виконати вимогу здачі зі скріншотами, модифікувати блок відображення профілю користувача:

```tsx
{me && (
  <div className="flex flex-col items-end text-xs text-white/95 sm:text-sm">
    <span className="font-semibold text-white truncate max-w-[200px]" title={me.email}>
      {me.email}
    </span>
    {me.name && (
      <span className="text-[11px] text-white/75 truncate max-w-[180px]">
        {me.name}
      </span>
    )}
  </div>
)}
```
Також прив'язати кнопку виходу до `logoutFromCognito()`.

---

### Завдання 3. Перевірка та адаптація бекенду (`back/app/auth.py`)
Переконатися, що ендпоінти вимагають та валідують токен:
- `verify_id_token` валідує підпис RS256 за допомогою пулу ключів `signing_keys()`.
- Ключі кешуються `@lru_cache`, що виключає повторні виклики.
- Якщо `COGNITO_JWKS` передано у змінні середовища (у продакшені на AWS Lambda), бекенд бере його з пам'яті і не робить зовнішніх мережевих запитів.
- Валідуються поля: `aud == settings.cognito_client_id`, `iss == settings.cognito_issuer`, термін дії `exp`, тип `token_use == "id"`.

---

## 4. Відповіді на запитання для захисту лабораторної роботи

Ці відповіді підготовлено безпосередньо для обговорення на парі (Class Discussion) та нотаток до здачі.

### Розділ 1: The Migration (Міграція архітектури)

1. **List every resource that bills by the hour in Stage 0. For each one, say what Stage 2 replaced it with, or why it simply disappeared.**
   - **Application Load Balancer (ALB):** Замінено на **Lambda Function URL** (прямий HTTPS-ендпоінт від AWS, безкоштовний у стані спокою).
   - **Public IPv4 addresses (2 на ALB + 1 на Fargate task):** Зникли. Lambda працює всередині приватних підмереж VPC і має Function URL без додаткової плати за IPv4.
   - **Fargate Task (0.25 vCPU, 0.5 GB):** Замінено на **AWS Lambda** (контейнерний образ). Оплата здійснюється тільки за фактичні мілісекунди виконання запитів; при 0 запитів вартість $0.
   - **RDS PostgreSQL `db.t3.micro`:** Замінено на **Aurora Serverless v2 PostgreSQL** (0–1 ACU). При простої кластер повністю ставиться на паузу (0 ACU) і оплачується лише зайняте сховище (~$0.10/міс).

2. **The ALB and the public IPv4 addresses cost more than the code. What exactly are you paying for when you pay for them?**
   - Ви платите за **гарантовану доступність та очікування підключень (cost of being reachable)**, а не за обчислення. ALB тримає розгорнуту та зарезервовану інфраструктуру AWS (щонайменше у двох зонах доступності), а публічні адреси IPv4 з лютого 2024 року тарифікуються компанією AWS по $0.005/год за кожну через глобальний дефіцит адресного простору IPv4.

3. **Aurora resumes in about 15 seconds. Who pays that cost, the company or a user? When is that acceptable, and when is it a bug?**
   - Цю ціну "платить" **перший користувач**, який робить запит після періоду неактивності: його запит зависає приблизно на 15 секунд (холодний старт БД).
   - **Коли це прийнятно:** у студентських проєктах, pet-проєктах, внутрішніх корпоративних інструментах, dev/staging середовищах, якими користуються зрідка (економія коштів перевищує незручність очікування).
   - **Коли це баг:** у публічних e-commerce, критичних API або B2C-продуктах, де 15-секундна затримка призводить до відтоку клієнтів і втрати прибутку.

4. **Stage 0 needed no CORS. Stage 2 does. What changed about origins, and what would you have to change to get back to a single origin?**
   - **Що змінилося:** У Stage 0 CloudFront проксував і статику (`/*`), і API (`/api/*` на ALB) через один домен, тому браузер бачив один Origin. У Stage 2 CloudFront роздає лише фронтенд, а браузер робить запити напряму на Lambda Function URL (`https://<id>.lambda-url.us-east-1.on.aws`). Це два різні домени (Cross-Origin), тому FastAPI змушений надсилати CORS-заголовки.
   - **Як повернутися до Single Origin:** Додати в CloudFront другий Origin, що вказує на Lambda Function URL, і прописати Cache Behavior для `/api/*` з пересиланням запитів туди.

5. **The frontend needs the API's URL at build time, and the API needs the frontend's URL for CORS. How does the Makefile break this cycle? Where else in this lab does the same cycle appear?**
   - **Як розривається цикл:** `Makefile` першим деплоїть бекенд із `CORS_ORIGINS="*"`. Потім білдить і деплоїть фронтенд, дізнаючись його точну адресу CloudFront. Після цього повторно викликається оновлення бекенду (`aws-frontend-cors` / `KEEP_IMAGE=1`), де замість `*` підставляються реальні домени фронтенду.
   - **Де ще з'являється цей цикл:** У налаштуванні **Cognito Callback URLs**: User Pool Client вимагає передачі Callback URL фронтенду (`https://<cloudfront-domain>/auth/callback`), але CloudFront-дистрибуція створюється після пулу. Тому спочатку задаються localhost-адреси, а після деплою фронтенду викликається `aws-frontend-cors`, який оновлює параметри `CallbackURLs` стеку Cognito.

6. **Why does the Lambda function have no NAT gateway? What stops working the day it needs to call an external API, such as an LLM provider?**
   - **Чому немає NAT Gateway:** NAT Gateway коштує ~$33/міс за кожну зону, що знецінює всю економію безсерверної архітектури.
   - **Що зламається:** Якщо Lambda спробує викликати зовнішній HTTP API (наприклад OpenAI, Stripe, Anthropic), запит завершиться таймаутом, оскільки підмережі Lambda приватні і не мають маршруту до інтернету.
   - **Рішення без NAT Gateway:** Якщо потрібен доступ лише до сервісів AWS (наприклад, SSM, S3, Secrets Manager, Bedrock), використовуються **VPC Endpoints** (PrivateLink). Для вільного доступу до сторонніх API потрібен NAT (або дешевий fgt/t4g NAT instance замість AWS NAT Gateway).

7. **Moving to us-east-1 simplified the deploy. What did it cost users in Ukraine, and what would it cost a company with EU customers?**
   - **Для користувачів в Україні:** Збільшився Round-Trip Time (RTT). До Франкфурта (eu-central-1) RTT складає ~30 мс, а до Вірджинії (us-east-1) — ~120-150 мс. Статичний сайт не постраждав завдяки Edge-кешуванню CloudFront, але кожен запит до API додає ~100 мс затримки.
   - **Для європейської компанії:** Це викликає проблему **Data Residency / GDPR**. Зберігання персональних даних громадян ЄС на серверах у США вимагає дотримання складних юридичних механізмів передачі даних (EU-US Data Privacy Framework) або прямо порушує законодавство.

---

### Розділ 2: The Cost (Вартість та фінансова модель)

1. **Fill in the scenario table for your Lab 2 deployment. Which row are you in?**
   - Студентський демо-проєкт перебуває в **першому або другому рядку** ("Nobody uses it" — ~$0.30/міс або "Class demos: 10 sessions x 2h" — ~$1.50/міс).

2. **Your uptime monitor pings `/health` every minute. Does `/health` touch the database? If it does, what does the monitor cost you per month, and how would you fix it without losing the monitor?**
   - У `back/app/routers/health.py` ендпоінт виконує `db.execute(text("SELECT 1"))`, отже, він **торкається бази даних**!
   - **Вартість:** Оскільки Aurora засинає лише після 5 хвилин повної відсутності з'єднань, щохвилинний пінг триматиме її активною 730 годин на місяць. При 0.5–1 ACU це коштуватиме **від $44 до $88 на місяць** замість $0.30!
   - **Як виправити:** Розділити healthcheck на два:
     - `/health` (liveness) — просто повертає `{"status": "ok"}` без звернення до БД (монітор пінгує його і перевіряє тільки працездатність Lambda).
     - `/health/ready` (readiness) — перевіряє з'єднання з БД і викликається лише за необхідності або під час старту.

3. **At what traffic level would you migrate back to containers and an RDS instance? What would you watch in Cost Explorer to know you had reached it?**
   - **Критерій для бази даних:** Якщо Aurora активна понад 257 годин на місяць (~35% часу), звичайний `db.t3.micro` стає дешевшим ($15.44/міс).
   - **Критерій для обчислень (Compute):** Lambda стає дорожчою за постійний Fargate + ALB після ~42 мільйонів запитів на місяць (~16 запитів/сек цілодобово).
   - **Що дивитися в Cost Explorer:** Слідкувати за сервісами `Amazon Aurora` (метрика `ServerlessUsage` в ACU-годинах) та `AWS Lambda` (кількість викликів і `GB-Seconds`).

4. **The AWS Free Tier makes Stage 0 look cheap in year one. Why is that a bad basis for an architecture decision?**
   - Free Tier триває лише 12 місяців (а для акаунтів після липня 2025 взагалі діє лише грант на 6 місяців). Обирати архітектуру під тимчасові знижки небезпечно: на 13-й місяць рахунок раптово зросте з $0 до $52+/міс без жодної зміни у коді чи трафіку. Архітектурні рішення мають ґрунтуватися на сталій ціновій моделі (Unit Economics).

---

### Розділ 3: Authentication & Cognito (Аутентифікація)

1. **What is the difference between the ID token and the access token? Which one goes to the API?**
   - **ID Token:** призначений для **клієнта (SPA)** і містить інформацію про особу користувача (профіль: `sub`, `email`, `name`, час входу). Стандарт OIDC передбачає його валідацію клієнтом.
   - **Access Token:** призначений для **ресурсного сервера (API)** для авторизації прав доступу (містить `scopes`, `client_id`, `sub`).
   - *У нашому проєкті:* Оскільки API потребує знати `email` та ім'я користувача для створення запису в БД, фронтенд передає **ID token** як `Bearer`, а бекенд валідує `aud == client_id` та `token_use == "id"`. (У чистому OAuth 2.0 на API передається Access Token, а профіль за потреби береться через ендпоінт `/oauth2/userInfo`).

2. **Why do a public client and PKCE belong together? What does PKCE protect against that a client secret would, if the browser could keep one?**
   - Публічний клієнт (Single Page Application у браузері) не може приховати `Client Secret`, оскільки будь-який користувач може відкрити DevTools або вихідний код JS.
   - **PKCE (Proof Key for Code Exchange):** динамічно генерує одноразовий секрет (`code_verifier`) безпосередньо в пам'яті браузера перед запитом, а на сервер авторизації відправляє його хеш (`code_challenge`).
   - **Від чого захищає:** Захищає від перехоплення авторизаційного коду зловмисником (наприклад, через історію браузера, відкриті редіректи або малваре). Без оригінального `code_verifier`, який залишився у session storage легітимної вкладки, обміняти код на токени неможливо.

3. **Cognito Essentials is free up to 10,000 monthly active users. What does it cost at 50,000? And at what point would you consider running your own authentication?**
   - **Вартість на 50,000 MAU:** Перші 10,000 безкоштовні. Решта 40,000 MAU на тарифі Essentials тарифікуються за ціною $0.015 за користувача:  
     \(40,000 \times \$0.015 = \$600\) на місяць.
   - **Коли варто розгортати власний Auth:** Якщо кількість користувачів вимірюється сотнями тисяч (де рахунок Cognito сягає тисяч доларів щомісяця), або коли потрібна нестандартна логіка безпеки, зберігання даних суворо On-Premise чи повна незалежність від вендора (наприклад, self-hosted Keycloak, SuperTokens, Ory Kratos або Auth.js).

4. **The same person signs up with a password, then later uses Continue with Google with the same email. Cognito now holds two users with two different subs. Which of your tables break? How would you link the two accounts, and why is it dangerous to link automatically on email alone?**
   - **Що зламається:** Якщо таблиця `users` використовує `sub` як первинний ключ, у базі з'явиться два окремих записи користувача з однаковим email. Якщо ж на стовпчик `email` накладено обмеження `UNIQUE`, виклик `get_or_create` впаде з помилкою `IntegrityError` при спробі входу через Google! Крім того, користувач не побачить зустрічей, створених під парольним акаунтом.
   - **Як об'єднати (Account Linking):** За допомогою Cognito Pre Sign-up Lambda Trigger викликати метод `AdminLinkProviderForUser`, який прив'язує Google ідентичність до існуючого парольного профілю.
   - **Чому небезпечно лінкувати автоматично лише за email:** Якщо провайдер не гарантує верифікацію пошти, зловмисник може зареєструвати сторонній акаунт із чужим email і автоматично отримати повний доступ до облікового запису жертви (Account Takeover). Для безпечного лінкування обидва джерела мають підтвердити володіння адресою (`email_verified: true`).

5. **The Google client secret lives in Cognito, but the Cognito app client has no secret at all. Why can one side hold a secret and the other cannot?**
   - **Cognito** — це бекенд-сервіс AWS, розміщений на захищених серверах, здатний надійно зберігати `Client Secret` у зашифрованому вигляді.
   - **Cognito App Client** взаємодіє з браузером користувача (SPA на React). Браузер є недовіреним середовищем (Client-Side), звідки будь-який збережений ключ може бути прочитаний користувачем.

6. **Google's consent screen names your app and its domain. What does the user see there, and why does that matter for phishing?**
   - Користувач бачить офіційне вікно Google із назвою додатку, його логотипом та доменом, який запитує авторизацію (у нашому випадку домен Cognito: `meetings-xxx.auth.us-east-1.amazoncognito.com`).
   - **Значення для захисту від фішингу:** Користувач може переконатися за адресним рядком браузера, що він дійсно перебуває на офіційному домені `accounts.google.com`, а редірект веде на легітимний сервіс. Якщо назва додатку або домен редіректу підозрілі, пильний користувач не надасть дозволу.

---

### Розділ 4: Stretch Goal Questions (Захист API)

1. **Why does verification happen in the backend? What could an attacker do if only the frontend checked whether the user is signed in?**
   - Код фронтенду повністю контролюється клієнтом. Якщо валідація лише на фронтенді, зловмисник може відредагувати JS-код у DevTools, обійти перевірку `isSignedIn()` або просто скопіювати URL бекенду з коду сайту та відправити `curl -X POST https://<lambda-url>/api/meetings` без жодної авторизації. Бекенд є єдиним надійним бар'єром безпеки (Zero Trust).

2. **Why not AuthType: `AWS_IAM` on the function URL?**
   - `AuthType: AWS_IAM` вимагає, щоб кожен HTTP-запит був підписаний за протоколом **AWS Signature Version 4 (SigV4)** за допомогою дійсних AWS IAM ключів (Access Key / Secret Key або тимчасових STS-токенів). Звичайний веб-браузер або Cognito User Pool користувач не мають таких ключів. Для публічного веб-сайту стандартом є відкритий HTTPS URL із передачею JWT-токена в заголовку `Authorization: Bearer`.

3. **What would a JWT authorizer on API Gateway take off your code, and what would it add to your bill?**
   - **Що зніме з коду:** З бекенду можна повністю видалити бібліотеку `PyJWT`, завантаження та парсинг JWKS, перевірку підпису та перевірку `aud`/`iss`. API Gateway автоматично відхилятиме невалідні запити з кодом 401 на рівні шлюзу ще до виклику Lambda, заощаджуючи ресурси виконання функції.
   - **Що додасть до рахунку:** API Gateway тарифікується окремо ($1.00 за мільйон запитів для HTTP API або $3.50 для REST API). Lambda Function URL надається безкоштовно. Крім того, додається затримка (latency) на рівні шлюзу.

---

## 5. Чекліст перевірки перед здачею (Submission Checklist)

- [ ] В Google Cloud Console екран згоди опублікований у **In production**.
- [ ] У Google Client ID додано Authorized redirect URI: `https://<prefix>.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`.
- [ ] Шаблон `infra/cognito.yaml` містить `UserPoolTier: ESSENTIALS`, `ManagedLoginVersion: 2` та `ManagedLoginBranding`.
- [ ] Виконано `make aws-cognito-deploy`, `make aws-backend-stack KEEP_IMAGE=1` та `make aws-frontend-deploy`.
- [ ] При відкритті `https://<ваш-домен>/login/` з'являється офіційна сторінка Cognito Managed Login.
- [ ] На сторінці логіну доступні: форма реєстрації/входу за паролем і кнопка **Continue with Google**.
- [ ] Після входу через пароль у шапці сайту чітко видно email користувача (знято скріншот 1).
- [ ] Після входу через сторонній Google-акаунт у шапці сайту чітко видно email Google (знято скріншот 2).
- [ ] Усі зміни закомічено в Git, отримано посилання на коміт.
- [ ] Підготовлено відповіді на теоретичні питання для обговорення на парі.
