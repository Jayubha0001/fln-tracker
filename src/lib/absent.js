// Gerhajar vidyarthi: answers ma `absent: 'yes'` (boolean nahi), jethi server na boolean-count / SQL class ne asar na thay.
export const isAbsent = (answers) => answers?.absent === 'yes';
export const absentAnswers = () => ({ absent: 'yes' });
