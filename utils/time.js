const WORK_SCHEDULES = {
  '1-4': [ { start: [7, 45], end: [12, 0] }, { start: [13, 0], end: [16, 0] } ],
  '5':   [ { start: [7, 45], end: [11, 30] }, { start: [13, 30], end: [16, 0] } ],
  '6':   [ { start: [7, 45], end: [12, 0] } ],
};

function isWorkTime(dateObject) {
  const day = dateObject.getDay();
  const timeInMinutes = dateObject.getHours() * 60 + dateObject.getMinutes();
  let schedule = null;
  
  if (day >= 1 && day <= 4) schedule = WORK_SCHEDULES['1-4'];
  else if (day === 5) schedule = WORK_SCHEDULES['5'];
  else if (day === 6) schedule = WORK_SCHEDULES['6'];
  
  if (!schedule) return false;

  for (const session of schedule) {
    const startInMinutes = session.start[0] * 60 + session.start[1];
    const endInMinutes = session.end[0] * 60 + session.end[1];
    if (timeInMinutes >= startInMinutes && timeInMinutes <= endInMinutes) return true;
  }
  return false;
}

module.exports = { isWorkTime };