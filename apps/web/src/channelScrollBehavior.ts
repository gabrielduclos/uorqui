/**
 * Opening a channel is not the same as receiving new messages.
 * Browser-generated scroll events during first paint and media resizing must
 * not cancel the initial anchor. Explicit reader input switches to manual mode.
 */
export class ChannelScrollBehavior {
  private key: string | null = null;
  private openingKey: string | null = null;
  private following = true;

  reset(): void { this.key = null; this.openingKey = null; this.following = true; }

  open(key: string): boolean {
    if (this.key === key) return false;
    this.key = key;
    this.openingKey = key;
    this.following = true;
    return true;
  }

  isOpening(key: string): boolean {
    return this.key === key && this.openingKey === key;
  }

  interrupt(key: string): void {
    if (this.key !== key) return;
    this.openingKey = null;
    this.following = false;
  }

  onScroll(key: string, atBottom: boolean): void {
    if (this.key !== key || this.openingKey === key) return;
    this.following = atBottom;
  }

  shouldFollow(key: string): boolean {
    return this.key === key && (this.openingKey === key || this.following);
  }

  shouldPinOnResize(key: string, grew: boolean, wasNearBottom: boolean): boolean {
    return this.shouldFollow(key) || (this.key === key && grew && wasNearBottom);
  }
}
