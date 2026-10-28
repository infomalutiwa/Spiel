import { TROOPS, type Unit } from '@burgwacht/shared';

export const isTroopUnit = (u: Unit): boolean => Object.hasOwn(TROOPS, u.type);
