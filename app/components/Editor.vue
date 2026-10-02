<template>
  <div>
    <UCard class="size-full">
      <template #header>
        <div class="flex flex-col gap-4">
          <div class="flex items-center space-x-5">
            <div>
              <p class="font-bold">Кількість груп</p>
              <UInputNumber
                v-model="cleaningGroupCount"
                @update:modelValue="handleCleaningGroupCount"
                :min="2"
                :max="10"
              />
            </div>
            <USeparator orientation="vertical" class="h-14" />
            <div>
              <p class="font-bold">Початковий тиждень</p>
              <UInputDate ref="inputDate" v-model="startDate" disabled>
                <template #trailing>
                  <UPopover :reference="inputDate?.inputsRef[3]?.$el">
                    <UButton variant="link" icon="lucide-calendar" class="px-0" />
                    <template #content>
                      <UCalendar
                        v-model="startDate"
                        :is-date-unavailable="isDateUnavailable"
                        weekStartsOn=1
                      />
                    </template>
                  </UPopover>
                </template>
              </UInputDate>
            </div>
            <USeparator orientation="vertical" class="h-14" />
            <div>
              <p class="font-bold">Початкова група</p>
              <UInputNumber
                v-model="initialCleaningGroup"
                :min="1"
                :max="cleaningGroupCount"
              />
            </div>
            <USeparator orientation="vertical" class="h-14" />
            <div>
              <UButton
                label="Зберегти"
                icon="lucide:save"
                class="font-bold"
                @click="previewOpen = true"
              />
            </div>
          </div>

          <!-- Дні тижня, у які відбувається прибирання (повторюється щотижня) -->
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-semibold">Дні прибирання</p>
            <UButton
              v-for="weekday in WEEKDAYS"
              :key="weekday.day"
              size="sm"
              :variant="isDaySelected(weekday.day) ? 'soft' : 'ghost'"
              :color="isDaySelected(weekday.day) ? 'primary' : 'neutral'"
              :label="startWeekDayLabels[weekday.day]"
              @click="toggleDay(weekday.day)"
            />
            <p class="text-xs text-(--ui-text-muted)">
              Обрані дні повторюються щотижня (дати — за початковим тижнем), на один тиждень — одна група
            </p>
          </div>
        </div>
      </template>

      <!-- У тілі картки — редактор розкладу -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold">
            Розклад прибирань — {{ WEEKS }} тижнів ({{ daysSummary }})
          </p>
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            icon="lucide:rotate-ccw"
            label="Скинути зміни"
            :disabled="noOverrides"
            @click="resetOverrides"
          />
        </div>

        <div class="max-h-[58vh] overflow-y-auto pr-1">
          <div class="flex flex-col gap-3">
            <!-- Один блок = один тиждень = одна група, усередині — дати цього тижня -->
            <div
              v-for="week in schedule"
              :key="week.index"
              class="flex flex-col gap-2 rounded-lg border border-(--ui-border) p-2"
              :class="{ 'bg-(--ui-bg-elevated)/60': week.mode === 'free' }"
            >
              <!-- Тиждень: назва + вибір групи -->
              <div
                class="grid grid-cols-[minmax(150px,1fr)_minmax(240px,1fr)_minmax(170px,220px)] items-center gap-3"
              >
                <p class="flex items-center gap-1 text-xs font-semibold tracking-wide text-(--ui-text-muted)">
                  <UIcon
                    v-if="week.isDatesEdited"
                    name="lucide:pencil"
                    class="size-3"
                  />
                  {{ week.label }}
                </p>

                <USelect
                  :model-value="week.selectValue"
                  :items="week.options"
                  size="sm"
                  class="w-full"
                  @update:model-value="setWeekMode(week.index, $event as string)"
                >
                  <template #leading>
                    <span v-if="week.groupDot" :class="week.groupDot" class="size-2.5 rounded-full" />
                  </template>
                  <template #item-leading="{ item }">
                    <span v-if="item.dot" :class="item.dot" class="size-2.5 rounded-full" />
                  </template>
                </USelect>

                <!-- Своє значення + перенесення групи -->
                <div v-if="week.mode === 'custom'" class="flex flex-col gap-1.5">
                  <UInput
                    :model-value="week.custom ?? ''"
                    size="sm"
                    placeholder="Введіть своє значення…"
                    @update:model-value="setCustomText(week.index, $event as string)"
                  />
                  <USwitch
                    :model-value="week.defer"
                    size="sm"
                    label="Перенести групу на наступний тиждень"
                    @update:model-value="setCustomDefer(week.index, $event as boolean)"
                  />
                </div>
                <!-- Без групи -->
                <div v-else-if="week.mode === 'free'" class="flex items-center gap-1.5 text-xs text-(--ui-text-muted)">
                  <UIcon name="lucide:arrow-right" class="size-3.5" />
                  Перенесено на наступний тиждень
                </div>
                <!-- Авто або явна група -->
                <div v-else class="flex items-center gap-2 text-sm">
                  <span v-if="week.groupDot" :class="week.groupDot" class="size-3 rounded-full" />
                  <span>Група {{ week.group }} прибирає</span>
                </div>
              </div>

              <!-- Дати тижня: день можна додати або прибрати -->
              <div class="flex flex-wrap items-center gap-2 pl-1">
                <div
                  v-for="date in week.dates"
                  :key="date.day"
                  class="flex h-8 items-center gap-0.5 rounded-md border border-(--ui-border) bg-(--ui-bg) px-2"
                >
                  <span class="text-xs font-medium whitespace-nowrap">{{ date.label }}</span>
                  <UButton
                    icon="lucide:x"
                    variant="link"
                    color="neutral"
                    size="xs"
                    class="-mr-1 size-5 min-w-5"
                    :aria-label="`Прибрати ${date.label}`"
                    @click="removeDayFromWeek(week.index, date.day)"
                  />
                </div>

                <USelect
                  v-if="week.addDayOptions.length"
                  :model-value="pendingDay[week.index] ?? ''"
                  :items="week.addDayOptions"
                  size="sm"
                  class="w-[230px]"
                  placeholder="Додати день…"
                  @update:model-value="addDayToWeek(week.index, $event as string)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Модальне вікно з попереднім переглядом (A4) -->
    <Preview
      v-model:open="previewOpen"
      :rows="previewLines"
      :period="previewPeriod"
      :qr-content="qrContent"
    />
  </div>
</template>

<script setup lang="ts">
import type { DateValue } from '@internationalized/date';
import { getLocalTimeZone, today, startOfWeek } from '@internationalized/date';
import { cleaningGroupOptions } from '~/constants/cleaningGroup';

// Кількість тижнів у розкладі
const WEEKS = 24;

// Дні тижня у порядку календаря (weekStartsOn = 1). day — це Date#getDay()
const WEEKDAYS = [
  { day: 1, short: 'пн', name: 'Понеділок' },
  { day: 2, short: 'вт', name: 'Вівторок' },
  { day: 3, short: 'ср', name: 'Середа' },
  { day: 4, short: 'чт', name: 'Четвер' },
  { day: 5, short: 'пт', name: 'П’ятниця' },
  { day: 6, short: 'сб', name: 'Субота' },
  { day: 0, short: 'нд', name: 'Неділя' },
] as const;

// Порядок днів (пн → нд) та їхні назви — щоб не шукати в масиві щоразу
const WEEKDAY_ORDER: number[] = WEEKDAYS.map((weekday) => weekday.day);
const WEEKDAY_NAMES: Record<number, string> = Object.fromEntries(
  WEEKDAYS.map((weekday) => [weekday.day, weekday.name]),
);

// Зсув дня тижня відносно понеділка (0 = неділя → 6)
const weekdayOffset = (day: number) => (day === 0 ? 6 : day - 1);

// Форматори створюються один раз: новий Intl.DateTimeFormat() дуже дорогий,
// а розкладу доводиться форматувати сотні дат при кожній зміні
const TIME_ZONE = getLocalTimeZone();
const dateFormatter = new Intl.DateTimeFormat('uk-UA', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});
const dayMonthFormatter = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' });
const fullDateFormatter = new Intl.DateTimeFormat('uk-UA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// "середа, 5 листопада"
const formatDate = (value: Date) => dateFormatter.format(value).replaceAll('.', '');
// "5 листоп"
const formatDayMonth = (value: Date) => dayMonthFormatter.format(value).replace('.', '');
// "5 листопада 2026 р."
const formatFullDate = (value: Date) => fullDateFormatter.format(value);

// Режим правки для конкретного тижня
type EntryMode = 'group' | 'custom' | 'free';

/**
 * Правки користувача для конкретного тижня (тиждень = одна група):
 * - mode   — як визначити групу: group / custom / free (не задано = за чергою)
 * - value  — номер групи для mode = group
 * - custom — власний текст для mode = custom
 * - defer  — перенести групу на наступний тиждень (mode = custom)
 */
interface WeekOverride {
  mode?: EntryMode;
  value?: number;
  custom?: string;
  defer?: boolean;
}

// Опція випадаючого списку
interface ScheduleOption {
  label: string;
  value: string;
  description?: string;
  dot?: string | null;
  icon?: string;
}

// Одна дата всередині тижня: день тижня + підписи (короткий і повний)
interface ScheduleDate {
  day: number;
  label: string;
  date: DateValue;
  dateLabel: string;
}

// Частина тижня, що не залежить від груп (дати й підписи)
interface WeekDates {
  index: number;
  startDate: DateValue;
  label: string;
  isDatesEdited: boolean;
  dates: ScheduleDate[];
  addDayOptions: ScheduleOption[];
}

// Частина тижня, що не залежить від дат (черга груп)
interface WeekGroup {
  mode: 'auto' | EntryMode;
  group: number | null;
  custom: string | null;
  defer: boolean;
  groupDot: string | null;
  selectValue: string;
  options: ScheduleOption[];
}

interface ScheduleWeek extends WeekDates, WeekGroup {}

// Налаштування: кількість груп (зберігається), початкова група, початковий тиждень
const cleaningGroupCount = ref((await settingsStore.get<number>('cleaningGroupCount')) ?? 2);
const initialCleaningGroup = ref(1);
const startDate = shallowRef(startOfWeek(today(TIME_ZONE), 'mon'));

// Дні тижня з прибираннями (зберігаються). За замовчуванням — лише понеділок
const storedDays = await settingsStore.get<number[]>('cleaningDays');
const storedValidDays = Array.isArray(storedDays)
  ? WEEKDAY_ORDER.filter((day) => storedDays.includes(day))
  : [];
const selectedDays = ref<number[]>(storedValidDays.length ? storedValidDays : [1]);

// Правки груп — по тижнях
const weekOverrides = ref<Record<number, WeekOverride>>({});
// Власні дні тижня після ручного редагування (тиждень без такого списку
// використовує дні, обрані в шапці)
const weekDayOverrides = ref<Record<number, number[]>>({});

// Обраний день у полі "Додати день…" (скидається після додавання)
const pendingDay = ref<Record<number, string>>({});

const inputDate = useTemplateRef('inputDate');

const readWeekOverride = (weekIndex: number): WeekOverride => weekOverrides.value[weekIndex] ?? {};

// Дні конкретного тижня: власний список або обрані в шапці
const weekDays = (weekIndex: number): number[] => weekDayOverrides.value[weekIndex] ?? selectedDays.value;

// Прибираємо ключі з undefined — тоді "Скинути зміни" бачить порожню правку
const withoutEmpty = (next: Record<string, unknown>): Record<string, unknown> => {
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next;
};

// Записуємо правку групи
const writeWeekOverride = (weekIndex: number, next: WeekOverride) => {
  const updated: Record<number, WeekOverride> = { ...weekOverrides.value };
  const clean = withoutEmpty({ ...next }) as WeekOverride;

  if (Object.keys(clean).length) updated[weekIndex] = clean;
  else delete updated[weekIndex];
  weekOverrides.value = updated;
};

// Дні тижня зберігаємо в порядку пн → нд
const writeWeekDays = (weekIndex: number, days: number[]) => {
  const sorted = WEEKDAY_ORDER.filter((day) => days.includes(day));

  const updated: Record<number, number[]> = { ...weekDayOverrides.value };
  if (sorted.length) updated[weekIndex] = sorted;
  else delete updated[weekIndex];
  weekDayOverrides.value = updated;
};

// Увімкнення/вимкнення дня тижня (принаймні один день має лишатись)
const isDaySelected = (day: number) => selectedDays.value.includes(day);

const toggleDay = (day: number) => {
  const current = selectedDays.value;
  const next = isDaySelected(day)
    ? WEEKDAY_ORDER.filter((value) => current.includes(value) && value !== day)
    : WEEKDAY_ORDER.filter((value) => current.includes(value) || value === day);

  if (!next.length) return;
  selectedDays.value = next;
  settingsStore.set('cleaningDays', next).catch(() => {});
};

// Після зміни кількості груп: обмежуємо початкову групу та скидаємо невалідні правки
watch(cleaningGroupCount, (count) => {
  if (initialCleaningGroup.value > count) initialCleaningGroup.value = count;

  const updated: Record<number, WeekOverride> = {};
  for (const [index, override] of Object.entries(weekOverrides.value)) {
    if (override.mode === 'group' && (override.value ?? 0) > count) continue;
    updated[Number(index)] = override;
  }
  weekOverrides.value = updated;
});

// Кольорові точки груп. Класи записані повністю, щоб Tailwind їх згенерував
const groupDotClass: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  lime: 'bg-lime-500',
  emerald: 'bg-emerald-500',
  cyan: 'bg-cyan-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
};

const groupDot = (group: number | null): string | null => {
  if (!group) return null;
  const color = cleaningGroupOptions[(group - 1) % cleaningGroupOptions.length]?.color;
  return color ? groupDotClass[color] ?? null : null;
};

// Назва кольору групи (для фонового заливання в PDF)
const groupColorName = (group: number | null): string | null => {
  if (!group) return null;
  return cleaningGroupOptions[(group - 1) % cleaningGroupOptions.length]?.color ?? null;
};

// Фоновий колір рядка в попередньому перегляді (світлий відтінок кольору групи)
const groupRowClass: Record<string, string> = {
  red: 'bg-red-500/30',
  orange: 'bg-orange-500/30',
  amber: 'bg-amber-500/30',
  lime: 'bg-lime-500/30',
  emerald: 'bg-emerald-500/30',
  cyan: 'bg-cyan-500/30',
  blue: 'bg-blue-500/30',
  indigo: 'bg-indigo-500/30',
  purple: 'bg-purple-500/30',
  pink: 'bg-pink-500/30',
};

const groupRowBg = (group: number | null): string | null => {
  if (!group) return null;
  const color = cleaningGroupOptions[(group - 1) % cleaningGroupOptions.length]?.color;
  return color ? groupRowClass[color] ?? null : null;
};

// Наступна група в черзі (зациклена)
const nextGroup = (group: number, count: number) => (group % count) + 1;

// Спільні опції списку (залежать лише від кількості груп)
const groupSelectOptions = computed<ScheduleOption[]>(() =>
  Array.from({ length: cleaningGroupCount.value }, (_, index) => ({
    label: `Група ${index + 1}`,
    value: `group:${index + 1}`,
    dot: groupDot(index + 1),
  })),
);
const customOption: ScheduleOption = { label: 'Своє значення', value: 'custom', icon: 'lucide:pen-line' };
const freeOption: ScheduleOption = { label: 'Без групи', value: 'free', description: 'Перенести на наступний тиждень' };

// Опції вибору групи залежать лише від кількості груп і номера авто-групи —
// кешуємо їх, щоб USelect не перебудовував список при кожній зміні
const weekOptionsCache = new Map<string, ScheduleOption[]>();

const weekOptions = (autoGroup: number): ScheduleOption[] => {
  const key = `${cleaningGroupCount.value}:${autoGroup}`;
  let cached = weekOptionsCache.get(key);
  if (cached) return cached;

  cached = [
    { label: 'За розкладом', value: 'auto', description: `Група ${autoGroup}`, dot: groupDot(autoGroup) },
    ...groupSelectOptions.value,
    customOption,
    freeOption,
  ];
  weekOptionsCache.set(key, cached);
  return cached;
};

// Дати тижнів: залежать лише від початкового тижня та обраних днів
const weekDates = computed<WeekDates[]>(() => {
  const first = startDate.value;

  return Array.from({ length: WEEKS }, (_, i) => {
    const weekStart = first.add({ days: i * 7 }); // понеділок тижня
    const days = weekDays(i);
    const dateOf = (day: number) => weekStart.add({ days: weekdayOffset(day) });

    return {
      index: i,
      startDate: weekStart,
      label: `Тиждень ${i + 1} · ${formatDayMonth(weekStart.toDate(TIME_ZONE))} — ${formatDayMonth(dateOf(0).toDate(TIME_ZONE))}`,
      isDatesEdited: weekDayOverrides.value[i] !== undefined,
      dates: days.map((day) => {
        const date = dateOf(day);
        const value = date.toDate(TIME_ZONE);
        return {
          day,
          date,
          label: `${WEEKDAY_NAMES[day]} · ${formatDayMonth(value)}`,
          dateLabel: formatDate(value),
        };
      }),
      addDayOptions: WEEKDAYS.filter((weekday) => !days.includes(weekday.day)).map((weekday) => ({
        label: `${weekday.name} · ${formatDayMonth(dateOf(weekday.day).toDate(TIME_ZONE))}`,
        value: `add:${weekday.day}`,
      })),
    };
  });
});

// Черга груп: залежить лише від груп і правок груп (дати не читає)
const weekGroups = computed<WeekGroup[]>(() => {
  const count = cleaningGroupCount.value;
  let pointer = initialCleaningGroup.value;

  return Array.from({ length: WEEKS }, (_, i) => {
    const override = readWeekOverride(i);
    const autoGroup = pointer;

    // За замовчуванням — наступна група з черги (черга зсувається раз на тиждень)
    let mode: WeekGroup['mode'] = 'auto';
    let group: number | null = pointer;
    let custom: string | null = null;
    const defer = override.defer ?? false;

    if (override.mode === 'group') {
      // Явно обрана група: черга продовжується після неї
      mode = 'group';
      group = override.value ?? pointer;
      pointer = nextGroup(group, count);
    } else if (override.mode === 'custom') {
      // Власний текст: черга зсувається, якщо defer вимкнено
      mode = 'custom';
      group = null;
      custom = override.custom || null;
      if (!defer) pointer = nextGroup(pointer, count);
    } else if (override.mode === 'free') {
      // Без групи: чергу не зсуваємо — ця група прибере наступного тижня
      mode = 'free';
      group = null;
    } else {
      // Авто: група "відпрацювала" тиждень
      pointer = nextGroup(pointer, count);
    }

    let selectValue = 'auto';
    if (mode === 'group') selectValue = `group:${group}`;
    else if (mode === 'custom') selectValue = 'custom';
    else if (mode === 'free') selectValue = 'free';

    return {
      mode,
      group,
      custom,
      defer,
      groupDot: groupDot(group),
      selectValue,
      options: weekOptions(autoGroup),
    };
  });
});

// Готовий розклад: дешеве злиття двох незалежних частин
const schedule = computed<ScheduleWeek[]>(() => {
  const groups = weekGroups.value;
  return weekDates.value.map((dates, i) => ({ ...dates, ...groups[i] }));
});

// Підпис обраних днів у заголовку ("пн, ср, пт")
const daysSummary = computed(() =>
  WEEKDAYS.filter((weekday) => selectedDays.value.includes(weekday.day))
    .map((weekday) => weekday.short)
    .join(', '),
);

// Підписи днів початкового тижня для кнопок вибору дня
const startWeekDayLabels = computed<Record<number, string>>(() => {
  const labels: Record<number, string> = {};
  for (const weekday of WEEKDAYS) {
    const date = startDate.value.add({ days: weekdayOffset(weekday.day) }).toDate(TIME_ZONE);
    labels[weekday.day] = `${weekday.name} · ${formatDayMonth(date)}`;
  }
  return labels;
});

// Дані для попереднього перегляду (таблиця A4). Один рядок = один тиждень,
// усі його дати — в одній комірці, група одна на тиждень
const previewLines = computed(() =>
  schedule.value.map((week) => ({
    year: week.dates[0]?.date.year ?? week.startDate.year,
    dateLabel: week.dates.map((date) => date.dateLabel).join(', '),
    value:
      week.mode === 'custom'
        ? week.custom || '—'
        : week.mode === 'free'
          ? '—'
          : `Група ${week.group}`,
    rowClass: week.mode === 'auto' || week.mode === 'group' ? groupRowBg(week.group) : null,
    color: week.mode === 'auto' || week.mode === 'group' ? groupColorName(week.group) : null,
  })),
);

// Період графіка (перша — остання дата)
const previewPeriod = computed(() => {
  const weeks = weekDates.value;
  if (!weeks.length || !weeks[0].dates.length) return '';
  const lastWeek = weeks[weeks.length - 1];
  return `${formatFullDate(weeks[0].dates[0].date.toDate(TIME_ZONE))} — ${formatFullDate(lastWeek.dates.at(-1)!.date.toDate(TIME_ZONE))}`;
});

// Стан модального вікна попереднього перегляду
const previewOpen = ref(false);

// Зміст QR-коду: посилання на проєкт
const qrContent = 'https://github.com/MatthewCoder13/clean-dater';

// Зміна групи тижня через випадаючий список
const setWeekMode = (weekIndex: number, value: string) => {
  const override = readWeekOverride(weekIndex);
  const next: WeekOverride = {};

  if (value.startsWith('group:')) {
    next.mode = 'group';
    next.value = Number(value.slice(6));
  } else if (value === 'custom') {
    next.mode = 'custom';
    next.custom = override.custom ?? '';
    next.defer = override.defer ?? false;
  } else if (value === 'free') {
    next.mode = 'free';
  }

  writeWeekOverride(weekIndex, next);
};

// Додавання дня до тижня (значення виду "add:3")
const addDayToWeek = (weekIndex: number, value: string) => {
  const day = Number(value.slice(4));
  const current = weekDays(weekIndex);
  if (!current.includes(day)) writeWeekDays(weekIndex, [...current, day]);
  pendingDay.value = { ...pendingDay.value, [weekIndex]: '' };
};

// Прибирання дня з тижня (принаймні один день має лишатись)
const removeDayFromWeek = (weekIndex: number, day: number) => {
  const next = weekDays(weekIndex).filter((value) => value !== day);
  if (!next.length) return;
  writeWeekDays(weekIndex, next);
};

const setCustomText = (weekIndex: number, value: string) => {
  const override = readWeekOverride(weekIndex);
  writeWeekOverride(weekIndex, {
    ...override,
    mode: 'custom',
    custom: value,
    defer: override.defer ?? false,
  });
};

const setCustomDefer = (weekIndex: number, value: boolean) => {
  const override = readWeekOverride(weekIndex);
  writeWeekOverride(weekIndex, {
    ...override,
    mode: 'custom',
    custom: override.custom ?? '',
    defer: value,
  });
};

const resetOverrides = () => {
  weekOverrides.value = {};
  weekDayOverrides.value = {};
};

const noOverrides = computed(
  () =>
    Object.keys(weekOverrides.value).length === 0 && Object.keys(weekDayOverrides.value).length === 0,
);

const handleCleaningGroupCount = (value: number) => {
  settingsStore.set('cleaningGroupCount', value).catch(() => {});
};

// Початковий тиждень — обираємо лише понеділки
const isDateUnavailable = (value: DateValue) => {
  return value.toDate(TIME_ZONE).getDay() !== 1;
};
</script>
