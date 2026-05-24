import maleWrestlers from './people/male-wrestler.json';
import femaleWrestlers from './people/female-wrestler.json';
import maleLegendWrestlers from './people/male-wrestler-legends.json';
import femaleLegendWrestlers from './people/female-wrestler-legends.json';
import maleReferees from './people/male-referee.json';
import femaleReferees from './people/female-referee.json';
import maleManagers from './people/male-manager.json';
import femaleManagers from './people/female-manager.json';
import maleAnnouncers from './people/male-announcer.json';
import femaleAnnouncers from './people/female-announcer.json';
import maleStaff from './people/male-staff.json';
import femaleStaff from './people/female-staff.json';
import { GAME_CONFIG } from '../config/gameConfig';

const areLegendsAllowed = GAME_CONFIG.allowLegends;

const peopleData = {
  wrestlers: [
    ...maleWrestlers,
    ...femaleWrestlers,
    ...(areLegendsAllowed ? maleLegendWrestlers : []),
    ...(areLegendsAllowed ? femaleLegendWrestlers : []),
  ],
  referees: [...maleReferees, ...femaleReferees],
  managers: [...maleManagers, ...femaleManagers],
  announcers: [...maleAnnouncers, ...femaleAnnouncers],
  staff: [...maleStaff, ...femaleStaff],
};

export default peopleData;
