import { useState } from "react";

import {
  login,
  register,
  requestPasswordReset,
} from "../services/api";


/*
 * Login / Sign-up / Forgot-password screen.
 *
 * Three modes share one form:
 *   "login"    email + password  -> log in
 *   "register" email + password  -> create account (with strength checks)
 *   "forgot"   email only        -> email a reset link
 *
 * Props:
 *   onAuthenticated(user) - called after a successful login or register.
 */
function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // After a forgot-password submit, we show a confirmation instead of the form.
  const [forgotMessage, setForgotMessage] = useState("");

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  // Live password checks (register only) — mirror the backend rules.
  const passwordChecks = [
    {
      label: "At least 8 characters",
      met: password.length >= 8,
    },
    {
      label: "One letter",
      met: /[a-zA-Z]/.test(password),
    },
    {
      label: "One number",
      met: /[0-9]/.test(password),
    },
  ];

  const passwordValid = passwordChecks.every(
    (check) => check.met,
  );

  async function handleSubmit(event) {
    event.preventDefault();

    if (isLoading) {
      return;
    }

    const cleanEmail = email.trim();
    setError("");

    // --- Forgot-password flow ---
    if (isForgot) {
      if (!cleanEmail) {
        return;
      }

      setIsLoading(true);

      try {
        const result = await requestPasswordReset(
          cleanEmail,
        );

        setForgotMessage(
          result.message ||
            "If an account exists for that email, a reset link has been sent.",
        );
      } catch (submitError) {
        setError(
          submitError.message ||
            "Something went wrong. Please try again.",
        );
      } finally {
        setIsLoading(false);
      }

      return;
    }

    // --- Login / register flow ---
    if (!cleanEmail || !password) {
      return;
    }

    if (isRegister && !passwordValid) {
      return;
    }

    setIsLoading(true);

    try {
      const authenticate = isRegister ? register : login;

      const user = await authenticate({
        email: cleanEmail,
        password,
      });

      onAuthenticated(user);
    } catch (submitError) {
      setError(
        submitError.message ||
          "Something went wrong. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setForgotMessage("");
  }

  const title = isForgot
    ? "Reset your password"
    : isRegister
      ? "Create your account"
      : "Welcome back";

  const subtitle = isForgot
    ? "Enter your email and we'll send you a reset link."
    : isRegister
      ? "Sign up to start chatting and making voice calls."
      : "Log in to continue to Aria.";

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-mark">A</div>
          <strong>Aria</strong>
        </div>

        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        {error && <div className="auth-error">{error}</div>}

        {/* Forgot-password, after sending: show confirmation, not the form. */}
        {isForgot && forgotMessage ? (
          <>
            <div className="auth-success">{forgotMessage}</div>

            <p className="auth-toggle">
              <button
                type="button"
                onClick={() => switchMode("login")}
              >
                Back to log in
              </button>
            </p>
          </>
        ) : (
          <>
            {mode === "login" && error && (
              <div className="auth-cta">
                <span>
                  Can&apos;t log in? If you&apos;re new here, create an account.
                </span>

                <button
                  type="button"
                  onClick={() => switchMode("register")}
                >
                  Create an account
                </button>
              </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="auth-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                />
              </label>

              {!isForgot && (
                <label className="auth-field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={
                      isRegister ? "At least 8 characters" : "Your password"
                    }
                    autoComplete={
                      isRegister ? "new-password" : "current-password"
                    }
                    minLength={isRegister ? 8 : undefined}
                    required
                  />
                </label>
              )}

              {isRegister && (
                <ul className="pw-reqs">
                  {passwordChecks.map((check) => (
                    <li
                      key={check.label}
                      className={check.met ? "met" : ""}
                    >
                      <span aria-hidden="true">
                        {check.met ? "✓" : "○"}
                      </span>
                      {check.label}
                    </li>
                  ))}
                </ul>
              )}

              {mode === "login" && (
                <button
                  type="button"
                  className="auth-link-inline"
                  onClick={() => switchMode("forgot")}
                >
                  Forgot password?
                </button>
              )}

              <button
                type="submit"
                className="auth-submit"
                disabled={
                  isLoading ||
                  !email.trim() ||
                  (!isForgot && !password) ||
                  (isRegister && !passwordValid)
                }
              >
                {isLoading
                  ? "Please wait…"
                  : isForgot
                    ? "Send reset link"
                    : isRegister
                      ? "Create account"
                      : "Log in"}
              </button>
            </form>

            <p className="auth-toggle">
              {isForgot ? (
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                >
                  Back to log in
                </button>
              ) : isRegister ? (
                <>
                  Already have an account?
                  <button
                    type="button"
                    onClick={() => switchMode("login")}
                  >
                    Log in
                  </button>
                </>
              ) : (
                <>
                  Don&apos;t have an account?
                  <button
                    type="button"
                    onClick={() => switchMode("register")}
                  >
                    Sign up
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </main>
  );
}


export default AuthScreen;
