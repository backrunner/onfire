import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input } from '@onfire/ui';
import { signUp, finalizeInstall } from '../api';

export function InstallPage({ onFinished }: { onFinished: () => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (!tenantName.trim()) {
      setError('请填写租户名称');
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
      setSuccess('初始化完成，即将进入系统');
      onFinished();
    } catch (err) {
      console.error(err);
      setError('初始化失败，请检查信息或稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 space-y-1">
          <div className="text-2xl font-semibold text-foreground">OnFire 安装向导</div>
          <div className="text-sm text-muted-foreground">当前实例尚未初始化，请创建超级管理员并完成基础租户配置。</div>
        </div>
        <form className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-2 md:col-span-1">
            <div className="text-sm font-medium text-foreground">超级管理员邮箱</div>
            <Input required type="email" value={email} onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-1">
            <div className="text-sm font-medium text-foreground">显示名称</div>
            <Input placeholder="可选，不填将使用邮箱前缀" value={displayName} onChange={(e: ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-1">
            <div className="text-sm font-medium text-foreground">密码</div>
            <Input required type="password" value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-1">
            <div className="text-sm font-medium text-foreground">确认密码</div>
            <Input required type="password" value={confirmPassword} onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="text-sm font-medium text-foreground">租户名称</div>
            <Input required placeholder="例如：Acme Inc" value={tenantName} onChange={(e: ChangeEvent<HTMLInputElement>) => setTenantName(e.target.value)} />
            <p className="text-xs text-muted-foreground">安装时至少需要创建一个租户，后续可在管理后台新增/编辑。</p>
          </div>
          {error && <div className="md:col-span-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">{error}</div>}
          {success && <div className="md:col-span-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">{success}</div>}
          <div className="md:col-span-2 flex items-center justify-end gap-3">
            <Button type="submit" loading={loading}>
              完成安装
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

