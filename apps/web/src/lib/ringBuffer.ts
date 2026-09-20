import type { InMemoryClip } from '@clipboard-sync/shared';

export class MemoryRingBuffer {
  private items: InMemoryClip[] = [];
  private readonly MAX_ITEMS = 20;

  push(clip: InMemoryClip): InMemoryClip[] {
    // Remove if duplicate itemId already exists
    this.items = this.items.filter(i => i.itemId !== clip.itemId);
    this.items.unshift(clip);

    // Evict oldest unpinned if over capacity
    if (this.items.length > this.MAX_ITEMS) {
      for (let i = this.items.length - 1; i >= 0; i--) {
        if (!this.items[i].isPinned) {
          const [evicted] = this.items.splice(i, 1);
          if (evicted.previewUrl) {
            URL.revokeObjectURL(evicted.previewUrl);
          }
          break;
        }
      }
    }

    return [...this.items];
  }

  togglePin(itemId: string): InMemoryClip[] {
    this.items = this.items.map(item =>
      item.itemId === itemId ? { ...item, isPinned: !item.isPinned } : item
    );
    return [...this.items];
  }

  delete(itemId: string): InMemoryClip[] {
    const target = this.items.find(i => i.itemId === itemId);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }
    this.items = this.items.filter(i => i.itemId !== itemId);
    return [...this.items];
  }

  clear(): InMemoryClip[] {
    for (const item of this.items) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
    this.items = [];
    return [];
  }

  getAll(): InMemoryClip[] {
    return [...this.items];
  }
}
