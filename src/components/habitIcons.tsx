import {
  BookOpen, Brain, Coffee, Droplet, Dumbbell, Footprints, Heart, Languages, Leaf, Moon, PenLine, Sun, type LucideIcon,
} from 'lucide-react';
import type { Habit } from '../db/schema';

export const HABIT_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  book: { icon: BookOpen, label: 'Книга' },
  leaf: { icon: Leaf, label: 'Лист' },
  droplet: { icon: Droplet, label: 'Вода' },
  dumbbell: { icon: Dumbbell, label: 'Спорт' },
  footprints: { icon: Footprints, label: 'Прогулка' },
  sun: { icon: Sun, label: 'Утро' },
  moon: { icon: Moon, label: 'Вечер' },
  brain: { icon: Brain, label: 'Повторение' },
  languages: { icon: Languages, label: 'Язык' },
  pen: { icon: PenLine, label: 'Письмо' },
  heart: { icon: Heart, label: 'Забота' },
  coffee: { icon: Coffee, label: 'Отдых' },
};

export const HABIT_COLORS = ['#176B50', '#2F7F86', '#4F6D8A', '#B08A4A', '#B4664A', '#5B5F97', '#7A5C82', '#6B7A73'];

/** Иконка по умолчанию подбирается по названию, если пользователь её не выбрал. */
export function habitIconKey(h: Pick<Habit, 'name' | 'icon' | 'unit'>): string {
  if (h.icon && HABIT_ICONS[h.icon]) return h.icon;
  const n = h.name.toLowerCase();
  if (/вод|пить/.test(n) || h.unit === 'glasses') return 'droplet';
  if (/коран|чтени|книг|читать/.test(n)) return 'book';
  if (/спорт|зарядк|трениров|отжим/.test(n)) return 'dumbbell';
  if (/прогул|шаг|ходьб/.test(n)) return 'footprints';
  if (/язык|слов|арабск|англ/.test(n)) return 'languages';
  if (/повтор|память|заучив/.test(n)) return 'brain';
  if (/утр|подъ/.test(n)) return 'sun';
  if (/сон|вечер/.test(n)) return 'moon';
  return 'leaf';
}

export function HabitIcon({ h, size = 40 }: { h: Pick<Habit, 'name' | 'icon' | 'unit' | 'color'>; size?: number }) {
  const Icon = HABIT_ICONS[habitIconKey(h)].icon;
  const color = h.color ?? '#176B50';
  return (
    <span className="grid shrink-0 place-items-center rounded-xl" aria-hidden
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 14%, transparent)`, color: `color-mix(in srgb, ${color} 85%, var(--text))` }}>
      <Icon size={size * 0.48} />
    </span>
  );
}
