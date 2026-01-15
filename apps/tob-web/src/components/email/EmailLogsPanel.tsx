import { useState } from 'react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Alert,
  AlertDescription,
  Skeleton
} from '@onfire/ui';
import {
  Mail,
  Inbox,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  Filter,
  Info
} from 'lucide-react';

interface EmailLogsPanelProps {
  products: Array<{ id: string; name: string }>;
}

export function EmailLogsPanel({ products }: EmailLogsPanelProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'inbound' | 'outbound'>('inbound');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Email Logs</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            View inbound and outbound email activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="space-y-1">
            <Label htmlFor="log-product-filter" className="sr-only">Filter by Product</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger id="log-product-filter" className="w-[200px]">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Products</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Info Alert */}
      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Email logs show all inbound emails received via webhooks and outbound emails sent through configured providers.
          Logs are retained for 30 days.
        </AlertDescription>
      </Alert>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="inbound">
            <Inbox className="w-4 h-4 mr-2" />
            Inbound Emails
          </TabsTrigger>
          <TabsTrigger value="outbound">
            <Send className="w-4 h-4 mr-2" />
            Outbound Emails
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="w-5 h-5" />
                Inbound Email Logs
              </CardTitle>
              <CardDescription>
                Received emails from customers via configured inbound addresses
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                <Inbox className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No logs available</p>
                <p className="text-sm mt-1">API endpoint implementation in progress</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outbound" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5" />
                Outbound Email Logs
              </CardTitle>
              <CardDescription>
                Emails sent to customers via notification system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                <Send className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No logs available</p>
                <p className="text-sm mt-1">API endpoint implementation in progress</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
