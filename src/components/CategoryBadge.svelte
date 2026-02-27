<script lang="ts">
  import type { Category } from '../lib/types'
  let { category }: { category: Category } = $props()
</script>

<!--
  PBL: box-shadow con el color del badge = efecto glow.
  El truco: mismo color que el fondo pero con alpha bajo (40).
  En dark mode el glow se ve mucho más porque el fondo es oscuro.
-->
<span
  class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
  style="
    background: {category.color};
    box-shadow: 0 0 10px {category.color}40, 0 0 2px {category.color}60;
    font-family: var(--font-body);
    letter-spacing: 0.01em;
  "
>
  {category.name}
</span>
