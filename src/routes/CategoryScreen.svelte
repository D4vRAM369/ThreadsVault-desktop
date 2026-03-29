<script lang="ts">
  import { categories } from '../lib/stores/vault'
  import { t, tn, locale } from '../lib/i18n'
  import CategoryManager from '../components/CategoryManager.svelte'
  $locale // reactive subscription
</script>

<div class="max-w-lg mx-auto px-4 py-6 animate-fade-up">
  <div class="flex items-center gap-3 mb-8">
    <button
      onclick={() => window.location.hash = '#/settings'}
      class="w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200"
      style="background: var(--vault-surface); border: 1px solid var(--vault-border)"
      onmouseenter={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface-hover)'}
      onmouseleave={(e) => (e.currentTarget as HTMLElement).style.background = 'var(--vault-surface)'}
      aria-label={t('common.back')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--vault-on-bg)">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
    </button>
    <div>
      <h1 style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; color: var(--vault-on-bg)">
        {t('cat.title')}
      </h1>
      <p class="text-xs" style="color: var(--vault-on-bg-muted)">
        {tn('cat.drag_hint', { n: $categories.length })}
      </p>
    </div>
  </div>

  <CategoryManager />
</div>
