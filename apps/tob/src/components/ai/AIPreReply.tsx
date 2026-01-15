import { useState, useEffect } from 'react';
import { Button, Badge, Textarea } from '@onfire/ui';
import { Bot, Sparkles, Copy, CheckCircle2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { getTicketScreening, screenTicket, generatePreReply, type AIScreeningResult } from '../../api';

interface AIPreReplyProps {
  ticketId: string;
  onUseReply: (reply: string) => void;
}

const getValidityBadge = (validity: string) => {
  switch (validity) {
    case 'valid':
      return <Badge variant="success" size="sm">有效工单</Badge>;
    case 'invalid':
      return <Badge variant="destructive" size="sm">无效工单</Badge>;
    case 'spam':
      return <Badge variant="destructive" size="sm">垃圾信息</Badge>;
    case 'rant':
      return <Badge variant="warning" size="sm">纯抱怨</Badge>;
    default:
      return <Badge variant="secondary" size="sm">{validity}</Badge>;
  }
};

export function AIPreReply({ ticketId, onUseReply }: AIPreReplyProps) {
  const [loading, setLoading] = useState(false);
  const [screening, setScreening] = useState<AIScreeningResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [generatingReply, setGeneratingReply] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadScreening = async () => {
    try {
      const result = await getTicketScreening(ticketId);
      setScreening(result);
    } catch (err) {
      console.error('Failed to load screening:', err);
    }
  };

  useEffect(() => {
    loadScreening();
  }, [ticketId]);

  const handleScreen = async () => {
    setLoading(true);
    try {
      await screenTicket(ticketId);
      await loadScreening();
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReply = async () => {
    setGeneratingReply(true);
    try {
      await generatePreReply(ticketId);
      await loadScreening();
    } finally {
      setGeneratingReply(false);
    }
  };

  const handleCopy = async () => {
    if (screening?.suggestedReply) {
      await navigator.clipboard?.writeText(screening.suggestedReply);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUseReply = () => {
    if (screening?.suggestedReply) {
      onUseReply(screening.suggestedReply);
    }
  };

  // No screening data yet
  if (!screening?.status) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">AI 分析</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleScreen} loading={loading}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            开始分析
          </Button>
        </div>
      </div>
    );
  }

  // Processing
  if (screening.status === 'processing') {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          AI 正在分析中...
        </div>
      </div>
    );
  }

  // Error
  if (screening.status === 'error') {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            AI 分析失败
          </div>
          <Button size="sm" variant="outline" onClick={handleScreen} loading={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            重试
          </Button>
        </div>
      </div>
    );
  }

  // Completed
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-500" />
          <span className="text-sm font-medium">AI 分析结果</span>
          {screening.result && getValidityBadge(screening.result.validity)}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </div>

      {expanded && screening.result && (
        <div className="border-t border-border p-3 space-y-3">
          {/* Confidence & Reasoning */}
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">置信度:</span> {Math.round(screening.result.confidence * 100)}%
            <span className="mx-2">·</span>
            <span>{screening.result.reasoning}</span>
          </div>

          {/* Extracted Issues */}
          {screening.extractedIssues.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">提取的问题:</div>
              <div className="flex flex-wrap gap-1">
                {screening.extractedIssues.map((issue, i) => (
                  <Badge key={i} variant="secondary" size="sm">
                    {issue}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Keywords */}
          {screening.keywords.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">关键词:</div>
              <div className="flex flex-wrap gap-1">
                {screening.keywords.map((kw, i) => (
                  <Badge key={i} variant="outline" size="sm">
                    {kw}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Tags */}
          {screening.result.suggestedTags.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">建议标签:</div>
              <div className="flex flex-wrap gap-1">
                {screening.result.suggestedTags.map((tag, i) => (
                  <Badge key={i} variant="info" size="sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Refresh Analysis */}
          <div className="pt-2 border-t border-border">
            <Button size="sm" variant="outline" onClick={handleScreen} loading={loading}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              重新分析
            </Button>
          </div>
        </div>
      )}

      {/* Suggested Reply Section */}
      <div className="border-t border-border p-3">
        {screening.suggestedReply ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground">AI 建议回复:</div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                </Button>
                <Button size="sm" variant="outline" onClick={handleGenerateReply} loading={generatingReply}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
              {screening.suggestedReply}
            </div>
            <Button className="w-full" size="sm" onClick={handleUseReply}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              使用此回复
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">尚未生成 AI 回复建议</span>
            <Button size="sm" variant="outline" onClick={handleGenerateReply} loading={generatingReply}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              生成回复
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
