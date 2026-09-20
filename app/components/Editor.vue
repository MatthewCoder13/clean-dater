<template>
  <div>
    <UCard class="size-full">
      <template #header>
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
            <p class="font-bold">Початкова дата</p>
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
      </template>

      <!-- У тілі картки — редактор розкладу -->
      <div class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold">
            Розклад прибирань — {{ WEEKS }} тижнів (щопонеділка)
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
          <div class="flex flex-col gap-2">
            <!-- Один рядок = один тиждень -->
            <div
              v-for="row in schedule"
              :key="row.index"
              class="grid grid-cols-[190px_minmax(240px,1fr)_minmax(170px,220px)] items-center gap-3 rounded-md p-2 transition-colors hover:bg-(--ui-bg-elevated)"
              :class="{ 'bg-(--ui-bg-elevated)/60': row.mode === 'free' }"
            >
              <!-- Дата (понеділок) -->
              <p class="text-sm font-medium">{{ row.dateLabel }}</p>

              <!-- Вибір: авто / група / своє значення / без групи -->
              <USelect
                :model-value="row.selectValue"
                :items="row.options"
                size="sm"
                class="w-full"
                @update:model-value="setOverride(row.index, $event as string)"
              >
                <template #leading>
                  <span v-if="row.groupDot" :class="row.groupDot" class="size-2.5 rounded-full" />
                </template>
                <template #item-leading="{ item }">
                  <span v-if="item.dot" :class="item.dot" class="size-2.5 rounded-full" />
                </template>
              </USelect>

              <!-- Своє значення + перенесення групи -->
              <div v-if="row.mode === 'custom'" class="flex flex-col gap-1.5">
                <UInput
                  :model-value="getCustomText(row.index)"
                  size="sm"
                  placeholder="Введіть своє значення…"
                  @update:model-value="setCustomText(row.index, $event as string)"
                />
                <USwitch
                  :model-value="getCustomDefer(row.index)"
                  size="sm"
                  label="Перенести групу на наступний тиждень"
                  @update:model-value="setCustomDefer(row.index, $event as boolean)"
                />
              </div>
              <!-- Без групи -->
              <div v-else-if="row.mode === 'free'" class="flex items-center gap-1.5 text-xs text-(--ui-text-muted)">
                <UIcon name="lucide:arrow-right" class="size-3.5" />
                Перенесено на наступний тиждень
              </div>
              <!-- Авто або явна група -->
              <div v-else class="flex items-center gap-2 text-sm">
                <span v-if="row.groupDot" :class="row.groupDot" class="size-3 rounded-full" />
                <span>Група {{ row.group }} прибирає</span>
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

// Кількість тижнів у розкладі (один день на тиждень — понеділок)
const WEEKS = 24;

/**
 * Правка користувача для конкретного тижня:
 * - group  — явно задана група
 * - custom — власний текст (+ defer = перенести групу на наступний тиждень)
 * - free   — без групи (група автоматично переноситься на наступний тиждень)
 */
type ScheduleOverride =
  | { mode: 'group'; value: number }
  | { mode: 'custom'; value: string; defer?: boolean }
  | { mode: 'free' };

// Опція випадаючого списку
interface ScheduleOption {
  label: string;
  value: string;
  description?: string;
  dot?: string | null;
  icon?: string;
}

// Рядок розкладу: Date + Group або Custom
interface ScheduleRow {
  index: number;
  date: DateValue;
  dateLabel: string;
  mode: 'auto' | 'group' | 'custom' | 'free';
  group: number | null;
  custom: string | null;
  groupDot: string | null;
  selectValue: string;
  options: ScheduleOption[];
}

// Налаштування: кількість груп (зберігається), початкова група, початкова дата
const cleaningGroupCount = ref((await settingsStore.get<number>('cleaningGroupCount')) ?? 2);
const initialCleaningGroup = ref(1);
const startDate = shallowRef(startOfWeek(today(getLocalTimeZone()), 'mon'));

// Правки по тижнях (null = за розкладом). індекси відповідають rows у schedule
const overrides = ref<Array<ScheduleOverride | null>>(Array(WEEKS).fill(null));

const inputDate = useTemplateRef('inputDate');

// Після зміни кількості груп: обмежуємо початкову групу та скидаємо невалідні правки
watch(cleaningGroupCount, (count) => {
  if (initialCleaningGroup.value > count) initialCleaningGroup.value = count;
  overrides.value = overrides.value.map((override) =>
    override?.mode === 'group' && override.value > count ? null : override,
  );
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

// Головний computed: будує 24 тижні з урахуванням правок і "черги" груп
const schedule = computed<ScheduleRow[]>(() => {
  const count = cleaningGroupCount.value;
  const rows: ScheduleRow[] = [];
  let pointer = initialCleaningGroup.value;

  for (let i = 0; i < WEEKS; i++) {
    const date = startDate.value.add({ days: i * 7 }); // понеділок тижня
    const o = overrides.value[i];

    // За замовчуванням — наступна група з черги
    let mode: ScheduleRow['mode'] = 'auto';
    let group: number | null = pointer;
    let custom: string | null = null;

    if (o?.mode === 'group') {
      // Явно обрана група: черга продовжується після неї
      mode = 'group';
      group = o.value;
      pointer = nextGroup(o.value, count);
    } else if (o?.mode === 'custom') {
      // Власний текст: черга зсувається, якщо defer вимкнено
      mode = 'custom';
      group = null;
      custom = o.value;
      if (!o.defer) pointer = nextGroup(pointer, count);
    } else if (o?.mode === 'free') {
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

    rows.push({
      index: i,
      date,
      dateLabel: formatDate(date),
      mode,
      group,
      custom,
      groupDot: groupDot(group),
      selectValue,
      options: [
        { label: 'За розкладом', value: 'auto', description: `Група ${group}`, dot: groupDot(group) },
        ...groupSelectOptions.value,
        customOption,
        freeOption,
      ],
    });
  }

  return rows;
});

const formatDate = (value: DateValue) =>
  new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' })
    .format(value.toDate(getLocalTimeZone()))
    .replace(/\./g, '');

// Дані для попереднього перегляду (таблиця A4)
const previewLines = computed(() =>
  schedule.value.map((row) => ({
    year: row.date.year,
    dateLabel: row.dateLabel,
    value:
      row.mode === 'custom'
        ? row.custom || '—'
        : row.mode === 'free'
          ? '—'
          : `Група ${row.group}`,
    rowClass: row.mode === 'auto' || row.mode === 'group' ? groupRowBg(row.group) : null,
    color: row.mode === 'auto' || row.mode === 'group' ? groupColorName(row.group) : null,
  })),
);

// Період графіка (перший — останній тиждень)
const previewPeriod = computed(() => {
  if (!schedule.value.length) return '';
  const formatFull = (value: DateValue) =>
    new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
      .format(value.toDate(getLocalTimeZone()));
  const { date: first } = schedule.value[0];
  const { date: last } = schedule.value[schedule.value.length - 1];
  return `${formatFull(first)} — ${formatFull(last)}`;
});

// Стан модального вікна попереднього перегляду
const previewOpen = ref(false);

// Зміст QR-коду: посилання на проєкт
const qrContent = 'https://github.com/MatthewCoder13/clean-dater';

// Зміна режиму тижня через випадаючий список
const setOverride = (index: number, value: string) => {
  if (value === 'auto') overrides.value[index] = null;
  else if (value === 'custom') overrides.value[index] = { mode: 'custom', value: getCustomText(index) };
  else if (value === 'free') overrides.value[index] = { mode: 'free' };
  else if (value.startsWith('group:')) overrides.value[index] = { mode: 'group', value: Number(value.slice(6)) };
};

// Читання/запис тексту "свого значення" (об'єкт перезаписуємо, щоб не втратити defer)
const getCustomText = (index: number): string =>
  overrides.value[index]?.mode === 'custom' ? overrides.value[index].value : '';

const setCustomText = (index: number, value: string) => {
  if (overrides.value[index]?.mode === 'custom') {
    overrides.value[index] = { mode: 'custom', value, defer: getCustomDefer(index) };
  }
};

// Стан перемикача "перенести групу"
const getCustomDefer = (index: number): boolean =>
  overrides.value[index]?.mode === 'custom' ? !!overrides.value[index].defer : false;

const setCustomDefer = (index: number, value: boolean) => {
  if (overrides.value[index]?.mode === 'custom') {
    overrides.value[index] = { mode: 'custom', value: getCustomText(index), defer: value };
  }
};

const resetOverrides = () => {
  overrides.value = Array(WEEKS).fill(null);
};

const noOverrides = computed(() => overrides.value.every((override) => override === null));

const handleCleaningGroupCount = (value: number) => {
  settingsStore.set('cleaningGroupCount', value).catch(() => {});
};

// Дозволяємо обирати лише понеділки
const isDateUnavailable = (value: DateValue) => {
  return value.toDate(getLocalTimeZone()).getDay() !== 1;
};
</script>