// backend/scheduler.js (continued)

      // Calculate session start and end times
      const sessionStart = new Date(startTimeDate);
      sessionStart.setHours(sessionStartHour, sessionStartMinute);
      
      const sessionEnd = new Date(sessionStart);
      sessionEnd.setMinutes(sessionEnd.getMinutes() + sessionLengthMinutes);
      
      // Format the time range for display
      const timeRange = `${formatTime(sessionStart)} - ${formatTime(sessionEnd)}`;
      
      // Check if this time slot conflicts with unavailable times
      if (!isTimeSlotAvailable(day, sessionStart, sessionEnd)) {
        // Try to find another time slot later in the day
        let found = false;
        for (let hour = sessionStartHour + 1; hour < endTimeDate.getHours(); hour++) {
          const altStart = new Date(startTimeDate);
          altStart.setHours(hour, sessionStartMinute);
          
          const altEnd = new Date(altStart);
          altEnd.setMinutes(altEnd.getMinutes() + sessionLengthMinutes);
          
          if (isTimeSlotAvailable(day, altStart, altEnd)) {
            const altTimeRange = `${formatTime(altStart)} - ${formatTime(altEnd)}`;
            
            // Create the study block with the alternative time
            const randomFocusIndex = Math.floor(Math.random() * allFocusAreas.length);
            const studyBlock = {
              time: altTimeRange,
              subject: selectedCourse.name,
              focus: allFocusAreas[randomFocusIndex]
            };
            
            schedule[day].push(studyBlock);
            found = true;
            break;
          }
        }
        
        // If we couldn't find an alternative slot, put this session back in the pool
        if (!found) {
          courseSessionsRemaining[selectedCourse.name]++;
        }
      } else {
        // Create the study block
        const randomFocusIndex = Math.floor(Math.random() * allFocusAreas.length);
        const studyBlock = {
          time: timeRange,
          subject: selectedCourse.name,
          focus: allFocusAreas[randomFocusIndex]
        };
        
        schedule[day].push(studyBlock);
      }
    }
    
    // Sort the day's sessions by time
    schedule[day].sort((a, b) => {
      const aTime = a.time.split(' - ')[0];
      const bTime = b.time.split(' - ')[0];
      return aTime.localeCompare(bTime);
    });
  });
  
  // Calculate analytics
  const analytics = calculateAnalytics(schedule, courses, examDates);
  
  return {
    schedule,
    analytics
  };
};

const calculateAnalytics = (schedule, courses, examDates) => {
  // Calculate total study hours and distribution by subject
  let totalStudyHours = 0;
  const subjectDistribution = {};
  
  // Initialize all subjects with 0 hours
  courses.forEach(course => {
    subjectDistribution[course.name] = 0;
  });
  subjectDistribution['General Review'] = 0;
  
  // Calculate hours per subject from the schedule
  Object.values(schedule).forEach(daySchedule => {
    daySchedule.forEach(session => {
      // Each study session is 90 minutes = 1.5 hours
      const sessionHours = 1.5;
      totalStudyHours += sessionHours;
      
      if (subjectDistribution[session.subject] !== undefined) {
        subjectDistribution[session.subject] += sessionHours;
      } else {
        subjectDistribution[session.subject] = sessionHours;
      }
    });
  });
  
  // Generate AI recommendations based on the schedule
  const recommendations = [];
  
  // Check if subjects with upcoming exams have enough study time
  examDates.forEach(exam => {
    const examDate = new Date(exam.date);
    const currentDate = new Date();
    const daysUntilExam = Math.ceil((examDate - currentDate) / (1000 * 60 * 60 * 24));
    
    if (daysUntilExam <= 14) {
      const subject = exam.subject;
      const hoursForSubject = subjectDistribution[subject] || 0;
      
      if (daysUntilExam <= 7 && hoursForSubject < 10) {
        recommendations.push(`Consider adding more ${subject} sessions before the upcoming exam in ${daysUntilExam} days.`);
      } else if (daysUntilExam <= 14 && hoursForSubject < 7) {
        recommendations.push(`Increase study time for ${subject} as the exam is approaching in ${daysUntilExam} days.`);
      }
    }
  });
  
  // Check subject balance based on priority
  const coursePriorities = {};
  courses.forEach(course => {
    coursePriorities[course.name] = course.priority;
  });
  
  // Find highest priority course
  const highestPriorityCourse = Object.keys(coursePriorities).reduce((a, b) => 
    coursePriorities[a] > coursePriorities[b] ? a : b
  );
  
  if (subjectDistribution[highestPriorityCourse] > totalStudyHours * 0.3) {
    recommendations.push(`Your ${highestPriorityCourse} focus is appropriate given its high priority.`);
  }
  
  // Add general study technique recommendations
  const studyTechniques = [
    'Try using spaced repetition for improving retention.',
    'Consider the Pomodoro technique for better focus during study sessions.',
    'Adding active recall through practice tests can improve memory retention.',
    'Review your notes within 24 hours of making them to solidify understanding.',
    'Try teaching the material to someone else to identify knowledge gaps.'
  ];
  
  // Add 1-2 random study technique recommendations
  const randomTechniqueIndex = Math.floor(Math.random() * studyTechniques.length);
  recommendations.push(studyTechniques[randomTechniqueIndex]);
  
  if (recommendations.length < 3) {
    let secondIndex = (randomTechniqueIndex + 1) % studyTechniques.length;
    recommendations.push(studyTechniques[secondIndex]);
  }
  
  return {
    totalStudyHours,
    subjectDistribution,
    recommendations
  };
};

module.exports = { optimizeSchedule };