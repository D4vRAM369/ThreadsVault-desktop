<script lang="ts">
  // Sin props ni estado: componente puramente presentacional.
  // Su única responsabilidad es mostrar un mensaje claro y un botón para salir.
</script>

<div class="flex flex-col items-center justify-center h-screen gap-6 px-4 text-center">
  <!-- Icono de brújula rota para comunicar "ruta inválida" -->
  <div class="text-6xl" aria-hidden="true">🧭</div>

  <div class="flex flex-col gap-2">
    <h1 class="text-2xl font-semibold" style="color: var(--vault-on-bg)">
      Ruta no encontrada
    </h1>
    <p class="text-sm" style="color: var(--vault-on-bg-muted)">
      La dirección <code class="font-mono px-1 py-0.5 rounded"
        style="background: var(--vault-surface-2); color: var(--vault-primary)"
      >{window.location.hash || '(vacío)'}</code> no existe en la app.
    </p>
  </div>

  <!-- Botón que lleva al vault (pantalla principal) -->
  <a
    href="#/"
    class="px-5 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
    style="background: var(--vault-primary); color: #fff"
  >
    Volver al inicio
  </a>
</div>
