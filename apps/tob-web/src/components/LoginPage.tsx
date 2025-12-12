import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input } from '@onfire/ui';
import { Turnstile } from '@marsidev/react-turnstile';
import { signIn } from '../api';
import { Flame, Mail, Lock, AlertCircle, Shield } from 'lucide-react';

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await signIn({ email, password, ...(turnstileToken ? { turnstile: turnstileToken } : {}) } as any);
      const token = (res as any)?.token ?? (res as any)?.sessionToken ?? (res as any)?.session?.token ?? (res as any)?.session?.sessionToken;
      if (token) localStorage.setItem('onfire.session', token);
      onSuccess();
    } catch (err) {
      setError('登录失败，请检查账号或稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4">
      {/* Logo & Branding */}
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
          <Flame className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">OnFire</h1>
        <p className="mt-1 text-sm text-muted-foreground">客服工作台</p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
          <div className="mb-6 space-y-1 text-center">
            <h2 className="text-lg font-semibold">欢迎回来</h2>
            <p className="text-sm text-muted-foreground">使用邮箱密码登录管理后台</p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium">邮箱</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  required
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  required
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {turnstileSiteKey ? (
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-sm font-medium">
                  <Shield className="h-3.5 w-3.5" />
                  安全验证
                </label>
                <div className="flex justify-center rounded-lg border border-border bg-muted/30 p-3">
                  <Turnstile siteKey={turnstileSiteKey} onSuccess={(token) => setTurnstileToken(token)} />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                未配置 Turnstile（VITE_TURNSTILE_SITE_KEY），将跳过验证码
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button className="w-full" type="submit" loading={loading}>
              登录
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} OnFire · 现代化客服工单系统
        </p>
      </div>
    </div>
  );
}
