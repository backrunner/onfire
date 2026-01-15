import { useState, useMemo, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input, Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription, Label, useTranslation } from '@onfire/ui';
import { signUp, finalizeInstall } from '../api';

interface PasswordValidation {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
}

const validatePassword = (password: string): PasswordValidation => ({
  minLength: password.length >= 8,
  hasUppercase: /[A-Z]/.test(password),
  hasLowercase: /[a-z]/.test(password),
  hasNumber: /[0-9]/.test(password)
});

const isPasswordValid = (validation: PasswordValidation): boolean =>
  validation.minLength && validation.hasUppercase && validation.hasLowercase && validation.hasNumber;

export function InstallPage({ onFinished }: { onFinished: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [touched, setTouched] = useState({ password: false, confirmPassword: false });

  const passwordValidation = useMemo(() => validatePassword(password), [password]);
  const passwordsMatch = password === confirmPassword;
  const canSubmit = isPasswordValid(passwordValidation) && passwordsMatch && email && tenantName.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isPasswordValid(passwordValidation)) {
      setError(t('install.passwordInvalid'));
      return;
    }
    if (!passwordsMatch) {
      setError(t('install.passwordMismatch'));
      return;
    }
    if (!tenantName.trim()) {
      setError(t('install.tenantRequired'));
      return;
    }

    setLoading(true);
    try {
      const signupRes = await signUp({ email, password, name: displayName || email.split('@')[0] });
      const token =
        (signupRes as any)?.token ??
        (signupRes as any)?.sessionToken ??
        (signupRes as any)?.session?.token ??
        (signupRes as any)?.session?.sessionToken;
      if (token) localStorage.setItem('onfire.session', token);
      await finalizeInstall({ tenantName, displayName: displayName || email.split('@')[0] });
      setSuccess(t('install.installSuccess'));
      onFinished();
    } catch (err) {
      console.error(err);
      setError(t('install.installFailed'));
    } finally {
      setLoading(false);
    }
  };

  const ValidationItem = ({ valid, text }: { valid: boolean; text: string }) => (
    <div className={`flex items-center gap-2 text-xs transition-colors ${valid ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
      <div className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${valid ? 'bg-emerald-500 text-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}>
        {valid && (
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span>{text}</span>
    </div>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 px-4 py-8">
      <div className="w-full max-w-2xl">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 dark:bg-zinc-100 mb-4">
            <svg className="h-8 w-8 text-white dark:text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">OnFire</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('login.footer')}</p>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800 shadow-xl">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-xl">{t('install.title')}</CardTitle>
            <CardDescription className="text-zinc-500 dark:text-zinc-400">
              {t('install.subtitle')}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-6">
              {/* Admin Account Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-xs font-semibold text-white dark:text-zinc-900">1</div>
                  <span>{t('install.adminAccountSection')}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pl-8">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-zinc-700 dark:text-zinc-300">
                      {t('install.adminEmail')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      required
                      type="email"
                      placeholder={t('install.adminEmailPlaceholder')}
                      value={email}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName" className="text-zinc-700 dark:text-zinc-300">
                      {t('install.displayName')}
                    </Label>
                    <Input
                      id="displayName"
                      placeholder={t('install.displayNamePlaceholder')}
                      value={displayName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
                      className="h-10"
                    />
                    <p className="text-xs text-zinc-500">{t('install.displayNameHint')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-zinc-700 dark:text-zinc-300">
                      {t('install.password')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="password"
                      required
                      type="password"
                      placeholder={t('install.passwordPlaceholder')}
                      value={password}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                      className="h-10"
                    />
                    {touched.password && password && (
                      <div className="grid grid-cols-2 gap-2 mt-3 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
                        <ValidationItem valid={passwordValidation.minLength} text={t('install.passwordMinLength')} />
                        <ValidationItem valid={passwordValidation.hasUppercase} text={t('install.passwordUppercase')} />
                        <ValidationItem valid={passwordValidation.hasLowercase} text={t('install.passwordLowercase')} />
                        <ValidationItem valid={passwordValidation.hasNumber} text={t('install.passwordNumber')} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-zinc-700 dark:text-zinc-300">
                      {t('install.confirmPassword')} <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="confirmPassword"
                      required
                      type="password"
                      placeholder={t('install.confirmPasswordPlaceholder')}
                      value={confirmPassword}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                      onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                      className="h-10"
                    />
                    {touched.confirmPassword && confirmPassword && (
                      <div className={`flex items-center gap-2 mt-2 text-xs ${passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                        {passwordsMatch ? (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>{t('install.passwordMatch')}</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span>{t('install.passwordMismatch')}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tenant Section */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100 text-xs font-semibold text-white dark:text-zinc-900">2</div>
                  <span>{t('install.tenantSection')}</span>
                </div>
                <div className="pl-8 space-y-2">
                  <Label htmlFor="tenantName" className="text-zinc-700 dark:text-zinc-300">
                    {t('install.tenantName')} <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="tenantName"
                    required
                    placeholder={t('install.tenantNamePlaceholder')}
                    value={tenantName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setTenantName(e.target.value)}
                    className="h-10 max-w-md"
                  />
                  <p className="text-xs text-zinc-500">{t('install.tenantNameHint')}</p>
                </div>
              </div>

              {/* Error / Success Messages */}
              {error && (
                <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-4 py-3">
                  <svg className="h-5 w-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
                </div>
              )}
              {success && (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30 px-4 py-3">
                  <svg className="h-5 w-5 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-emerald-700 dark:text-emerald-400">{success}</span>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-end border-t border-zinc-100 dark:border-zinc-800 pt-6">
              <Button type="submit" loading={loading} disabled={!canSubmit} className="h-10 px-6">
                {t('install.finishInstall')}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-600">
          {t('footer.tech')}
        </p>
      </div>
    </div>
  );
}
