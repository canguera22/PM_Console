import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface SessionHistoryCardProps {
  title: string;
  timestamp: string;
  onClick: () => void;
  description?: string;
  metaLine?: string;
  badges?: string[];
  maxBadges?: number;
  rightBadge?: string;
}

export function SessionHistoryCard({
  title,
  timestamp,
  onClick,
  description,
  metaLine,
  badges = [],
  maxBadges = 3,
  rightBadge,
}: SessionHistoryCardProps) {
  const visibleBadges = badges.slice(0, maxBadges);
  const overflowCount = badges.length - visibleBadges.length;

  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground">{timestamp}</p>
            {rightBadge ? (
              <Badge variant="outline" className="text-xs">
                {rightBadge}
              </Badge>
            ) : null}
          </div>

          <p className="font-medium text-sm">{title}</p>

          {description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
          ) : null}

          {metaLine ? (
            <p className="text-xs text-muted-foreground">{metaLine}</p>
          ) : null}

          {visibleBadges.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {visibleBadges.map((badge) => (
                <Badge key={badge} variant="secondary" className="text-xs">
                  {badge}
                </Badge>
              ))}
              {overflowCount > 0 ? (
                <Badge variant="secondary" className="text-xs">
                  +{overflowCount}
                </Badge>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
