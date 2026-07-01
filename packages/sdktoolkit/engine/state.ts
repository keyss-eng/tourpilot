import type{ TourStep } from '../api/types';
export class TourState {
  private steps: TourStep[];
  private currentIndex: number = 0;
  private tourId: string | null = null;

  constructor(steps: TourStep[], tourId?: string) {
    this.tourId = tourId ?? null;
    // Sort steps by stepOrder just in case they come out of order
  this.steps = (steps || []).sort((a, b) => a.stepOrder - b.stepOrder);
  }
  public getTourId(): string | null {
    return this.tourId;
  }

  public getCurrentStepIndex(): number {
    return this.steps[this.currentIndex]?.stepOrder ?? this.currentIndex;
  }

  // ✅ YEH ADD KARO
  public goToStep(stepOrder: number) {
    const index = this.steps.findIndex(s => s.stepOrder === stepOrder);
    if (index !== -1) this.currentIndex = index;
  }

  public getCurrentStep(): TourStep | null {
    return this.steps[this.currentIndex] || null;
  }
 
  public next(): boolean {
    if (this.currentIndex < this.steps.length - 1) {
      this.currentIndex++;
      return true;
    }
    return false;
  }

  public prev(): boolean {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return true;
    }
    return false;
  }
 
  public isLastStep(): boolean {
    return this.currentIndex === this.steps.length - 1;
  }

  public isFirstStep(): boolean {
    return this.currentIndex === 0;
  }
 
  public getStepNumber(): string {
    return `${this.currentIndex + 1} / ${this.steps.length}`;
  }
  
  public peekNextStep(): TourStep | null {
  return this.steps[this.currentIndex + 1] || null;
}
}
 