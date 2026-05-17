/**
 * UiStore — état éphémère de l'UI (filtre pots, période stats, sélections).
 */
import { Store } from './store';
import type { UiState, PotFilter, ScreenId, StatsPeriodId } from '@/types';

const INITIAL_UI: UiState = {
  currentScreen: 'dashboard',
  currentPotFilter: 'all',
  currentStatsPeriod: '7d',
  selectedPotId: null,
  selectedTankId: null,
  pairingStep: 1,
};

export class UiStore extends Store<UiState> {
  constructor(initial: UiState = INITIAL_UI) {
    super(initial);
  }

  setScreen(screen: ScreenId): void {
    this.patch({ currentScreen: screen });
  }

  setPotFilter(filter: PotFilter): void {
    this.patch({ currentPotFilter: filter });
  }

  setStatsPeriod(period: StatsPeriodId): void {
    this.patch({ currentStatsPeriod: period });
  }

  selectPot(id: string | null): void {
    this.patch({ selectedPotId: id });
  }

  selectTank(id: string | null): void {
    this.patch({ selectedTankId: id });
  }

  setPairingStep(step: number): void {
    this.patch({ pairingStep: step });
  }
}

export const uiStore = new UiStore();
