import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Input,
  Badge,
  ScrollArea,
  Dialog,
  DialogContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@onfire/ui';
import {
  Search,
  X,
  Sparkles,
  Clock,
  FileText,
  Filter,
  ChevronRight,
  Loader2,
  Command
} from 'lucide-react';
import {
  searchTickets as searchTicketsApi,
  getSearchSuggestions,
  type SearchResult,
  type SearchResponse
} from '../../api';

interface GlobalSearchProps {
  onSelectTicket?: (ticketId: string) => void;
}

const statusLabels: Record<string, string> = {
  new: '新建',
  processing: '处理中',
  replied: '已回复',
  escalated: '升级中',
  closed: '已关闭'
};

const priorityLabels: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低'
};

export function GlobalSearch({ onSelectTicket }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [semantic, setSemantic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('onfire.recentSearches');
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      } catch {}
    }
  }, []);

  // Keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await searchTicketsApi({
        q: searchQuery,
        semantic,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        pageSize: 10
      });
      setResults(response.results);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [semantic, statusFilter, priorityFilter]);

  // Load suggestions
  const loadSuggestions = useCallback(async (prefix: string) => {
    if (prefix.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const response = await getSearchSuggestions(prefix);
      setSuggestions(response.suggestions);
    } catch {
      setSuggestions([]);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (value: string) => {
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
      loadSuggestions(value);
    }, 300);
  };

  // Handle search submit
  const handleSearch = () => {
    if (!query.trim()) return;

    // Save to recent searches
    const newRecent = [query, ...recentSearches.filter((s) => s !== query)].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem('onfire.recentSearches', JSON.stringify(newRecent));

    performSearch(query);
  };

  // Handle ticket selection
  const handleSelectTicket = (ticketId: string) => {
    setOpen(false);
    if (onSelectTicket) {
      onSelectTicket(ticketId);
    } else {
      navigate(`/tickets/${ticketId}`);
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    performSearch(suggestion);
  };

  // Handle recent search click
  const handleRecentClick = (search: string) => {
    setQuery(search);
    performSearch(search);
  };

  return (
    <>
      {/* Trigger Button */}
      <Button
        size="sm"
        variant="outline"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">搜索</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
          <Command className="h-3 w-3" />K
        </kbd>
      </Button>

      {/* Search Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="搜索工单..."
              className="flex-1 border-0 bg-transparent focus-visible:ring-0 px-0"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Button
              size="sm"
              variant={semantic ? 'default' : 'outline'}
              onClick={() => setSemantic(!semantic)}
              title="语义搜索"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-muted/50">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部状态</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-8 w-32">
                  <SelectValue placeholder="优先级" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部优先级</SelectItem>
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(statusFilter || priorityFilter) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setStatusFilter('');
                    setPriorityFilter('');
                  }}
                >
                  清除筛选
                </Button>
              )}
            </div>
          )}

          {/* Results */}
          <ScrollArea className="max-h-[400px]">
            {/* Suggestions */}
            {suggestions.length > 0 && query && (
              <div className="p-2 border-b border-border">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  建议搜索
                </div>
                <div className="flex flex-wrap gap-1">
                  {suggestions.map((s, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => handleSuggestionClick(s)}
                    >
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Searches */}
            {!query && recentSearches.length > 0 && (
              <div className="p-2">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  最近搜索
                </div>
                {recentSearches.map((s, i) => (
                  <button
                    key={i}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left rounded-md hover:bg-muted"
                    onClick={() => handleRecentClick(s)}
                  >
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Search Results */}
            {results.length > 0 && (
              <div className="p-2">
                <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  搜索结果 ({results.length})
                  {semantic && (
                    <Badge variant="info" size="sm" className="ml-1">
                      语义搜索
                    </Badge>
                  )}
                </div>
                {results.map((result) => (
                  <button
                    key={result.id}
                    className="w-full flex items-start gap-3 px-2 py-2 text-left rounded-md hover:bg-muted group"
                    onClick={() => handleSelectTicket(result.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{result.subject}</span>
                        <Badge
                          variant={
                            result.status === 'closed'
                              ? 'secondary'
                              : result.status === 'escalated'
                              ? 'warning'
                              : 'default'
                          }
                          size="sm"
                        >
                          {statusLabels[result.status] || result.status}
                        </Badge>
                        {result.score && (
                          <span className="text-xs text-muted-foreground">
                            {Math.round(result.score * 100)}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {result.content.slice(0, 100)}...
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{result.customerEmail}</span>
                        <span>·</span>
                        <span>{result.productId}</span>
                        <span>·</span>
                        <span>{new Date(result.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}

            {/* No Results */}
            {query && !loading && results.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">未找到匹配的工单</p>
                {!semantic && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setSemantic(true)}
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    尝试语义搜索
                  </Button>
                )}
              </div>
            )}

            {/* Empty State */}
            {!query && recentSearches.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">输入关键词搜索工单</p>
                <p className="text-xs mt-1">
                  使用 <Sparkles className="inline h-3 w-3" /> 启用语义搜索
                </p>
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground bg-muted/30">
            <div className="flex items-center gap-4">
              <span>
                <kbd className="rounded border border-border bg-background px-1">↵</kbd> 搜索
              </span>
              <span>
                <kbd className="rounded border border-border bg-background px-1">ESC</kbd> 关闭
              </span>
            </div>
            <span>
              按 <kbd className="rounded border border-border bg-background px-1">⌘K</kbd> 随时打开
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
