<script lang="ts">
  import { t, locale } from '../lib/i18n'
  $locale // reactive subscription
</script>
<!--
  PBL: El SVG custom comunica "craftsmanship".
  El candado abierto con destellos refuerza la metáfora de la app.
  Los círculos con animación pulse crean vida sin ruido.
  opacity en el contenedor = la ausencia se siente "suave", no rota.
-->
<div class="flex flex-col items-center justify-center py-20 px-6 animate-fade-up">

  <!-- Ilustración SVG custom -->
  <div class="relative mb-8">
    <!-- Anillo exterior pulsante -->
    <div class="absolute inset-0 rounded-full"
         style="
           background: radial-gradient(circle, var(--vault-primary-glow) 0%, transparent 70%);
           width: 120px; height: 120px;
           top: 50%; left: 50%; transform: translate(-50%, -50%);
           animation: pulse-ring 3s ease-in-out infinite;
         ">
    </div>

    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Cuerpo del candado -->
      <rect x="16" y="38" width="48" height="32" rx="8"
            fill="rgba(124,77,255,0.12)"
            stroke="rgba(124,77,255,0.4)" stroke-width="1.5"/>

      <!-- Arco del candado (abierto = bóveda disponible) -->
      <path d="M26 38V26a14 14 0 0 1 28 0"
            stroke="rgba(124,77,255,0.6)" stroke-width="1.5"
            stroke-linecap="round" fill="none"/>

      <!-- Ojo del candado -->
      <circle cx="40" cy="54" r="5"
              fill="rgba(124,77,255,0.3)"
              stroke="rgba(124,77,255,0.6)" stroke-width="1.5"/>

      <!-- Ranura del candado -->
      <rect x="38.5" y="54" width="3" height="7" rx="1.5"
            fill="rgba(124,77,255,0.6)"/>

      <!-- Destellos -->
      <circle cx="62" cy="22" r="2" fill="var(--vault-secondary)" opacity="0.7">
        <animate attributeName="opacity" values="0.7;0.2;0.7" dur="2.5s" repeatCount="indefinite"/>
      </circle>
      <circle cx="18" cy="30" r="1.5" fill="var(--vault-tertiary)" opacity="0.6">
        <animate attributeName="opacity" values="0.6;0.15;0.6" dur="3s" begin="1s" repeatCount="indefinite"/>
      </circle>
      <circle cx="68" cy="50" r="1" fill="var(--vault-primary)" opacity="0.8">
        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="2s" begin="0.5s" repeatCount="indefinite"/>
      </circle>
    </svg>
  </div>

  <!-- Texto -->
  <h2 class="text-xl font-bold mb-2 text-center" style="font-family: var(--font-display); color: var(--vault-on-bg)">
    {t('empty.title')}
  </h2>
  <p class="text-sm text-center max-w-xs leading-relaxed" style="color: var(--vault-on-bg-muted)">
    Pulsa <strong style="color: var(--vault-primary)">{t('empty.add')}</strong> {t('empty.subtitle')}
  </p>

  <!-- Indicador decorativo -->
  <div class="flex gap-1.5 mt-8">
    {#each [0,1,2] as i}
      <div class="w-1.5 h-1.5 rounded-full"
           style="
             background: var(--vault-primary);
             opacity: {i === 1 ? '1' : '0.3'};
             animation: dot-pulse 2s ease-in-out {i * 0.3}s infinite;
           ">
      </div>
    {/each}
  </div>
</div>

<style>
  @keyframes pulse-ring {
    0%, 100% { transform: translate(-50%, -50%) scale(1);   opacity: 0.6; }
    50%       { transform: translate(-50%, -50%) scale(1.3); opacity: 0.2; }
  }
  @keyframes dot-pulse {
    0%, 100% { transform: scaleX(1);   }
    50%       { transform: scaleX(1.8); }
  }
</style>
