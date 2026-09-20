<template>
  <UModal v-model:open="model" fullscreen>
    <template #title>
      Попередній перегляд графіка
    </template>

    <template #body>
      <!-- Відступ на екрані, але НЕ на аркуші (html2pdf не враховує margin корректно) -->
      <div class="my-8 flex justify-center">
        <!-- Аркуш A4 (знімаємо в PDF через html2pdf) -->
        <div ref="sheetRef" class="flex w-[210mm] min-h-[297mm] flex-col bg-white text-black py-8 px-10 shadow-xl">
        <!-- Заголовок -->
        <div class="mb-6 text-center">
          <h1 class="text-2xl font-bold uppercase tracking-wide">
            Графік чергування груп
          </h1>
          <p class="mt-1 text-sm text-neutral-500">{{ period }}</p>
        </div>

        <!-- Таблиця розкладу -->
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="bg-neutral-100">
              <th class="w-10 border border-neutral-300 px-2 py-1.5 text-left font-semibold">№</th>
              <th class="border border-neutral-300 px-2 py-1.5 text-left font-semibold">Дата</th>
              <th class="border border-neutral-300 px-2 py-1.5 text-left font-semibold">Група</th>
            </tr>
          </thead>
          <!-- Кожен рік — окремий блок із заголовком-розділювачем -->
          <tbody v-for="group in groupedRows" :key="group.year">
            <tr>
              <td
                colspan="3"
                class="border border-neutral-300 bg-neutral-200 px-2 py-1 text-center font-bold tracking-widest uppercase"
              >
                {{ group.year }}
              </td>
            </tr>
            <!-- Рядок тижня: фон — колір групи -->
            <tr
              v-for="(line, i) in group.lines"
              :key="i"
              :class="line.rowClass ?? (i % 2 === 1 ? 'bg-neutral-50' : '')"
            >
              <td class="border border-neutral-300 px-2 py-1 text-neutral-500">{{ group.start + i + 1 }}</td>
              <td class="border border-neutral-300 px-2 py-1">{{ line.dateLabel }}</td>
              <td class="border border-neutral-300 px-2 py-1 font-medium">{{ line.value }}</td>
            </tr>
          </tbody>
        </table>

        <p v-if="hasDeferred" class="mt-4 text-xs text-neutral-500">
          * «—» — без групи: прибирання перенесено на наступний тиждень.
        </p>

        <!-- QR-код знизу зліва + позначка авторського права -->
        <div class="mt-auto pt-6">
          <div class="flex flex-col items-start gap-1">
            <div v-if="qrSvg" class="page-qr" v-html="qrSvg" />
            <p class="text-xs text-neutral-500">© 2026 Matthew Coder</p>
            <p class="text-xs text-neutral-500">MIT License</p>
          </div>
        </div>
      </div>
    </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between">
        <p class="text-xs text-(--ui-text-muted)">
          <template v-if="savedPath">Файл збережено: {{ savedPath }}</template>
          <template v-else>Кликни «Зберегти» — згенерується PDF і відкриється системний діалог вибору шляху.</template>
        </p>
        <div class="flex items-center gap-2">
          <UButton
            label="Закрити"
            color="neutral"
            variant="ghost"
            @click="model = false"
          />
          <UButton
            label="Зберегти"
            icon="lucide:file-pdf"
            color="primary"
            :loading="generating"
            @click="generatePdf"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { renderSVG } from 'uqr';

// Рядок для таблиці: дата + значення (група / своє значення / без групи)
interface PreviewLine {
  year: number;
  dateLabel: string;
  value: string;
  rowClass: string | null;
}

const props = defineProps<{
  rows: PreviewLine[];
  period?: string;
  qrContent?: string;
}>();

// Керування відкриттям/закриттям модалки (v-model:open)
const model = defineModel<boolean>('open');

// Аркуш A4 — його вигляд збираємо у PDF
const sheetRef = ref<HTMLElement | null>(null);

// Групуємо тижні по роках — для заголовків-розділювачів
const groupedRows = computed(() => {
  const groups: { year: number; start: number; lines: PreviewLine[] }[] = [];
  props.rows.forEach((line, index) => {
    const last = groups[groups.length - 1];
    if (!last || last.year !== line.year) {
      groups.push({ year: line.year, start: index, lines: [line] });
    } else {
      last.lines.push(line);
    }
  });
  return groups;
});

// QR-код (SVG) зі змісту, що передає Editor
const qrSvg = computed(() => (props.qrContent ? renderSVG(props.qrContent, { pixelSize: 6, border: 2 }) : ''));

const hasDeferred = computed(() => props.rows.some((line) => line.value === '—'));

// Дані для збереження "лежать" тут
const sheetData = computed(() => props.rows);

// Ім'я файлу: clean-dater-schedule-{роки}.pdf
const fileName = computed(() => {
  const years = [...new Set(props.rows.map((row) => row.year))];
  return years.length
    ? `clean-dater-schedule-${years.join('-')}.pdf`
    : 'clean-dater-schedule.pdf';
});

const pdfBlob = ref<Blob | null>(null);
const generating = ref(false);
const savedPath = ref('');

// Генерація PDF з точного вигляду аркуша (html2pdf = html2canvas-pro + jsPDF).
// html2canvas-pro alias-нується замість html2canvas у nuxt.config, щоб
// підтримувати кольори Tailwind v4 (oklch/color-mix).
const generatePdf = async () => {
  if (generating.value) return;
  generating.value = true;
  try {
    const el = sheetRef.value;
    if (!el) return;

    const mod = await import('html2pdf.js');
    const html2pdf = mod.default ?? mod;

    const blob = await html2pdf()
      .set({
        margin: 0,
        filename: fileName.value,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
      })
      .from(el)
      .outputPdf('blob');
    if (!blob) return;
    pdfBlob.value = blob;

    // Системний діалог вибору шляху (plugin-dialog) — повертає шлях
    const path = await saveDialog({
      defaultPath: fileName.value,
      filters: [{ name: 'PDF-документ', extensions: ['pdf'] }],
    });
    if (!path) return;
    // Запис PDF у цей шлях (plugin-fs)
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    savedPath.value = path;
  } finally {
    generating.value = false;
  }
};

// Доступ до даних ззовні: previewRef.value.sheetData / pdfBlob / generatePdf
defineExpose({ sheetData, pdfBlob, generatePdf });
</script>

<style scoped>
/* QR-код друкується чітко — фіксований розмір на аркуші */
.page-qr :deep(svg) {
  width: 7rem;
  height: 7rem;
}
</style>