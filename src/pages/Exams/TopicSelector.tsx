import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { getPeriodNumbers, getPeriodLabel } from '../../utils/periodConfig';
import type { PeriodMode } from '../../utils/periodConfig';
import type { TopicListItem } from '../../types';

interface TopicSelectorProps {
  classId: string;
  topics: TopicListItem[];
  selectedTopicIds: string[];
  onToggle: (topicId: string) => void;
  onBulkToggle: (ids: string[], selected: boolean) => void;
  trimesterFilter: string;
  onTrimesterFilterChange: (value: string) => void;
  periodMode?: PeriodMode | null;
}

const TopicSelector: React.FC<TopicSelectorProps> = ({
  classId,
  topics,
  selectedTopicIds,
  onToggle,
  onBulkToggle,
  trimesterFilter,
  onTrimesterFilterChange,
  periodMode,
}) => {
  const navigate = useNavigate();

  const topicTrimesters = useMemo(() => {
    return new Set(topics.map((t) => (t as any).trimester || 0));
  }, [topics]);

  const filteredTopics = useMemo(() => {
    let result = topics;
    if (trimesterFilter !== 'all') {
      const tri = parseInt(trimesterFilter);
      result = result.filter((t) => ((t as any).trimester || 0) === tri);
    }
    // Filter out topics without materials (including children sum)
    result = result.filter((t) => {
      const totalMaterials = (t.materialCount || 0) + (t.children || []).reduce((s, c) => s + (c.materialCount || 0), 0);
      return totalMaterials > 0;
    });
    return result;
  }, [topics, trimesterFilter]);

  return (
    <div className="gen-topics">
      <span className="gen-topics__label">
        Temas del examen
        {selectedTopicIds.length > 0 && (
          <Badge className="gen-topics__count">{selectedTopicIds.length}</Badge>
        )}
      </span>

      {/* Trimester filter */}
      {topics.length > 0 && topicTrimesters.size > 1 && (
        <div className="trimester-pills">
          <button
            className={`trimester-pill ${trimesterFilter === 'all' ? 'trimester-pill--active' : ''}`}
            onClick={() => onTrimesterFilterChange('all')}
          >Todos</button>
          {getPeriodNumbers(periodMode).filter((t) => topicTrimesters.has(t)).map((t) => (
            <button
              key={t}
              className={`trimester-pill ${trimesterFilter === String(t) ? 'trimester-pill--active' : ''}`}
              onClick={() => onTrimesterFilterChange(String(t))}
            >{getPeriodLabel(periodMode, t)}</button>
          ))}
        </div>
      )}

      {filteredTopics.length === 0 ? (
        <div className="gen-topics__empty">
          <p>{trimesterFilter !== 'all'
            ? 'No hay temas con materiales en este trimestre.'
            : 'No hay temas con materiales en esta asignatura. Añade materiales a los temas para poder seleccionarlos.'
          }</p>
          {trimesterFilter === 'all' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/tabs/classes/${classId}/topics`)}
            >
              Añadir temas
            </Button>
          )}
        </div>
      ) : (
        <div className="gen-topics__list">
          {filteredTopics.map((topic) => {
            const children = topic.children || [];
            const childIds = children.map(c => c.id);
            const allChildrenSelected = children.length > 0 && childIds.every(id => selectedTopicIds.includes(id));
            const someChildrenSelected = children.length > 0 && childIds.some(id => selectedTopicIds.includes(id));
            const parentSelected = selectedTopicIds.includes(topic.id);
            const isActive = parentSelected || allChildrenSelected;

            return (
              <div key={topic.id}>
                <div
                  className={`gen-topic-chip ${isActive ? 'gen-topic-chip--active' : someChildrenSelected ? 'gen-topic-chip--partial' : ''}`}
                  onClick={() => {
                    if (children.length === 0) {
                      onToggle(topic.id);
                    } else {
                      const allIds = [topic.id, ...childIds];
                      onBulkToggle(allIds, !isActive);
                    }
                  }}
                >
                  <Checkbox
                    checked={isActive}
                    data-indeterminate={!isActive && someChildrenSelected ? 'true' : undefined}
                    className="gen-topic-chip__check pointer-events-none"
                  />
                  <span className="gen-topic-chip__name">{topic.name}</span>
                  {children.length > 0 && (
                    <Badge variant="outline" className="text-[10px] font-semibold">{children.length} sub</Badge>
                  )}
                  <Badge variant="secondary" className="gen-topic-chip__materials">
                    {topic.materialCount + children.reduce((s, c) => s + (c.materialCount || 0), 0)}
                  </Badge>
                </div>
                {/* Subtopics */}
                {children.length > 0 && (parentSelected || someChildrenSelected) && (
                  <div style={{ paddingLeft: 20, borderLeft: '2px solid var(--color-primary-tint, #4d9a93)', marginLeft: 14, marginBottom: 4 }}>
                    {children.map(child => (
                      <div
                        key={child.id}
                        className={`gen-topic-chip gen-topic-chip--sub ${selectedTopicIds.includes(child.id) ? 'gen-topic-chip--active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onToggle(child.id); }}
                        style={{ marginTop: 2, marginBottom: 2 }}
                      >
                        <Checkbox checked={selectedTopicIds.includes(child.id)} className="gen-topic-chip__check pointer-events-none" />
                        <span className="gen-topic-chip__name" style={{ fontSize: 12 }}>{child.name}</span>
                        {child.materialCount > 0 && (
                          <Badge variant="secondary" className="gen-topic-chip__materials">{child.materialCount}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <p className="gen-materials-note">
            <Info size={16} />
            Se usarán hasta ~30.000 caracteres del material adjunto (repartidos entre todos los documentos).
          </p>
        </div>
      )}
    </div>
  );
};

export default TopicSelector;
