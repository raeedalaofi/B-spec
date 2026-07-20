import { registerScreen } from '../screenManager';
import { achievementsScreen } from './achievements';
import { careerRaceScreen } from './careerRace';
import { dealershipScreen } from './dealership';
import { driverScreen } from './driver';
import { eventsScreen } from './events';
import { freeRaceScreen } from './freeRace';
import { garageScreen } from './garage';
import { homeScreen } from './home';
import { licensesScreen } from './licenses';
import { mainMenuScreen } from './mainMenu';
import { resultsScreen } from './results';
import { tuningScreen } from './tuning';

export function registerAllScreens(): void {
  registerScreen('main-menu', mainMenuScreen);
  registerScreen('home', homeScreen);
  registerScreen('dealership', dealershipScreen);
  registerScreen('garage', garageScreen);
  registerScreen('tuning', tuningScreen);
  registerScreen('driver', driverScreen);
  registerScreen('events', eventsScreen);
  registerScreen('race', careerRaceScreen);
  registerScreen('results', resultsScreen);
  registerScreen('achievements', achievementsScreen);
  registerScreen('free-race', freeRaceScreen);
  registerScreen('licenses', licensesScreen);
}
