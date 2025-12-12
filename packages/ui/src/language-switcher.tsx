import { useLocale, type Locale } from './i18n';
import { Button } from './button';
import { Languages } from 'lucide-react';

const localeLabels: Record<Locale, string> = {
  zh: '中文',
  en: 'EN'
};

interface LanguageSwitcherProps {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  showIcon?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  variant = 'outline',
  size = 'sm',
  showIcon = true,
  className
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useLocale();

  const toggleLocale = () => {
    setLocale(locale === 'zh' ? 'en' : 'zh');
  };

  return (
    <Button variant={variant} size={size} onClick={toggleLocale} className={className}>
      {showIcon && <Languages className="mr-1.5 h-3.5 w-3.5" />}
      {localeLabels[locale]}
    </Button>
  );
}
