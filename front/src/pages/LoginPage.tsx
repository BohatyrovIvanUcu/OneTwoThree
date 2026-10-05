import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CircleCheck } from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router"
import { z } from "zod"

import { AuthLayout } from "@/components/auth/AuthLayout"
import { GoogleButton, OrDivider } from "@/components/auth/GoogleButton"
import { PasswordInput } from "@/components/auth/PasswordInput"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { AuthError, signIn } from "@/lib/auth"

const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

type LoginValues = z.infer<typeof loginSchema>

/** Set by the confirm page after a new account is verified. */
interface LoginState {
  email?: string
  confirmed?: boolean
}

export function LoginPage() {
  const navigate = useNavigate()
  const state = (useLocation().state ?? {}) as LoginState
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: state.email ?? "", password: "" },
  })

  const onSubmit = async ({ email, password }: LoginValues) => {
    try {
      await signIn(email, password)
      navigate("/home", { replace: true })
    } catch (error) {
      if (error instanceof AuthError && error.code === "UserNotConfirmedException") {
        navigate("/confirm", { state: { email } })
        return
      }
      form.setError("root", { message: error instanceof Error ? error.message : "Sign-in failed" })
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Sign in</h1>
      <p className="mt-2 text-sm text-slate-300/80">Welcome back. Sign in to see your meetings.</p>

      {state.confirmed && (
        <p className="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-3 text-sm text-emerald-200 backdrop-blur-md">
          <CircleCheck className="size-4 shrink-0 text-emerald-400" /> Account confirmed. Sign in to
          continue.
        </p>
      )}

      <div className="mt-7">
        <GoogleButton label="Continue with Google" />
      </div>
      <OrDivider />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-slate-200">Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-slate-200">Password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {form.formState.errors.root && (
            <p role="alert" className="text-sm font-medium text-rose-300">
              {form.formState.errors.root.message}
            </p>
          )}
          <Button
            type="submit"
            className="mt-2 h-11 w-full cursor-pointer text-base font-semibold shadow-lg"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Form>

      <p className="mt-6 text-center text-sm text-slate-300">
        Don&apos;t have an account?{" "}
        <Link
          to="/signup"
          className="font-semibold text-indigo-400 underline-offset-4 hover:text-indigo-300 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </AuthLayout>
  )
}
