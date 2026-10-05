import { useEffect } from "react"
import { LoaderCircle } from "lucide-react"

import { authConfig, startCognitoSignIn } from "@/lib/auth"

export function CognitoLoginPage() {
  useEffect(() => {
    const { domain, clientId } = authConfig()
    if (domain && clientId) {
      startCognitoSignIn()
    }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
      <div className="flex items-center gap-3 text-lg font-medium text-muted-foreground">
        <LoaderCircle className="size-6 animate-spin text-primary" />
        Redirecting to Cognito sign-in…
      </div>
      <button
        type="button"
        onClick={() => startCognitoSignIn()}
        className="mt-4 text-sm text-primary underline underline-offset-4 hover:opacity-80"
      >
        Click here if you are not redirected automatically
      </button>
    </div>
  )
}
