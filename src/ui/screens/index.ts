import { registerScreen } from '../screenManager';
import { careerRaceScreen } from './careerRace';
import { dealershipScreen } from './dealership';
import { driverScreen } from './driver';
import { eventsScreen } from './events';
import { garageScreen } from './garage';
import { homeScreen } from './home';
import { mainMenuScreen } from './mainMenu';
import { resultsScreen } from './results';

export function registerAllScreens(): void {
  registerScreen('main-menu', mainMenuScreen);
  registerScreen('home', homeScreen);
  registerScreen('dealership', dealershipScreen);
  registerScreen('garage', garageScreen);
  registerScreen('driver', driverScreen);
  registerScreen('events', eventsScreen);
  registerScreen('race', careerRaceScreen);
  registerScreen('results', resultsScreen);
}
