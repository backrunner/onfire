import type { PropsWithChildren, ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

export const Panel = ({ title, description, action, children }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode }>) => (
  <Card>
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      {action}
    </CardHeader>
    <CardContent className="flex flex-col gap-3 text-sm text-foreground">{children}</CardContent>
  </Card>
);
