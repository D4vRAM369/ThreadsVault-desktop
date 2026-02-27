<!--
  PBL: El spinner usa border con el color primario y border-top transparente.
  La rotación hace que parezca que "corre" alrededor del círculo.
  El glow exterior refuerza la identidad visual de la marca.
-->
<div class="flex flex-col items-center justify-center h-64 gap-4">
  <div class="relative">
    <!-- Glow de fondo -->
    <div class="absolute inset-0 rounded-full"
         style="
           background: var(--vault-primary-glow);
           filter: blur(12px);
           transform: scale(1.3);
         ">
    </div>

    <!-- Spinner -->
    <div class="relative w-11 h-11 rounded-full animate-spin" style="
      border: 2.5px solid rgba(124,77,255,0.15);
      border-top-color: var(--vault-primary);
      border-right-color: var(--vault-secondary);
    "></div>
  </div>

  <p class="text-xs tracking-widest uppercase"
     style="color: var(--vault-on-bg-muted); font-family: var(--font-display); letter-spacing: 0.15em">
    Cargando
  </p>
</div>
