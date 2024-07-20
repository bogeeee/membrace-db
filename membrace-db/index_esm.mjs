// A wrapper file for ESM to avoid the 'dual package hazard'. See https://nodejs.org/api/packages.html#approach-1-use-an-es-module-wrapper



import cjsIndex from "./index.js"
export const MembraceDb = cjsIndex.MembraceDb

// Inject devalue package into MembraceDb class here, cause this can be used in an ESM world only
import * as devalue from 'devalue';
MembraceDb._devalue = devalue;

import cjsDecorators from "./decorators.js"
export const persistence = cjsDecorators.persistence
