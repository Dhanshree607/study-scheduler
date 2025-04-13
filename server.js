// backend/server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { optimizeSchedule } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.post('/api/schedule', async (req, res) => {
  try {
    const userData = req.body;
    
    // Validate required fields
    if (!userData.courses || !userData.studyHoursPerDay) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }
    
    // Generate optimized schedule
    const result = await optimizeSchedule(userData);
    
    // Return the schedule and analytics
    res.json(result);
  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({ 
      error: 'Failed to generate schedule',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Get API documentation
app.get('/api/docs', (req, res) => {
  res.json({
    endpoints: [
      {
        path: '/api/schedule',
        method: 'POST',
        description: 'Generate an optimized study schedule',
        requestBody: {
          name: 'string',
          courses: 'array of objects with name and priority',
          studyHoursPerDay: 'number',
          breakLength: 'number (minutes)',
          startTime: 'string (HH:MM)',
          endTime: 'string (HH:MM)',
          learningStyle: 'string (visual, auditory, reading, kinesthetic)',
          unavailableTimes: 'array of objects with day, start, end',
          examDates: 'array of objects with subject and date'
        },
        response: {
          schedule: 'object with days as keys and arrays of study blocks',
          analytics: 'object with study statistics and recommendations'
        }
      },
      {
        path: '/api/health',
        method: 'GET',
        description: 'Check API health status',
        response: {
          status: 'string'
        }
      }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// backend/scheduler.js
const optimizeSchedule = async (userData) => {
  // Extract user data
  const {
    name,
    courses,
    studyHoursPerDay,
    breakLength,
    startTime,
    endTime,
    learningStyle,
    unavailableTimes = [],
    examDates = []
  } = userData;
  
  // Parse time strings to Date objects for calculations
  const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };
  
  const startTimeDate = parseTime(startTime);
  const endTimeDate = parseTime(endTime);
  
  // Calculate total available time in minutes per day
  const availableMinutesPerDay = (endTimeDate - startTimeDate) / (1000 * 60);
  
  // Calculate study session length (90 minutes is a common effective study block)
  const sessionLengthMinutes = 90;
  
  // Calculate how many sessions can fit in a day
  const maxSessionsPerDay = Math.min(
    Math.floor(studyHoursPerDay * 60 / sessionLengthMinutes),
    Math.floor(availableMinutesPerDay / (sessionLengthMinutes + parseInt(breakLength)))
  );
  
  // Sort courses by priority (higher priority first)
  const sortedCourses = [...courses].sort((a, b) => b.priority - a.priority);
  
  // Get upcoming exam dates to prioritize subjects with close exams
  const currentDate = new Date();
  const examPriorities = {};
  
  examDates.forEach(exam => {
    const examDate = new Date(exam.date);
    const daysUntilExam = Math.ceil((examDate - currentDate) / (1000 * 60 * 60 * 24));
    
    // The closer the exam, the higher the priority boost
    if (daysUntilExam <= 7) {
      examPriorities[exam.subject] = 3; // High boost for exams within a week
    } else if (daysUntilExam <= 14) {
      examPriorities[exam.subject] = 2; // Medium boost for exams within two weeks
    } else if (daysUntilExam <= 30) {
      examPriorities[exam.subject] = 1; // Small boost for exams within a month
    }
  });
  
  // Apply exam priority boosts to the courses
  sortedCourses.forEach(course => {
    if (examPriorities[course.name]) {
      course.priority += examPriorities[course.name];
    }
  });
  
  // Re-sort courses after applying exam boosts
  sortedCourses.sort((a, b) => b.priority - a.priority);
  
  // Create a mapping of days to unavailable time ranges
  const unavailableTimesByDay = {};
  unavailableTimes.forEach(({ day, start, end }) => {
    if (!unavailableTimesByDay[day]) {
      unavailableTimesByDay[day] = [];
    }
    unavailableTimesByDay[day].push({ start: parseTime(start), end: parseTime(end) });
  });
  
  // Define study focus areas based on learning style
  const focusAreasByStyle = {
    visual: ['Diagrams & Charts', 'Visual Notes', 'Mind Maps', 'Video Tutorials'],
    auditory: ['Lecture Recordings', 'Discussion Groups', 'Verbal Repetition', 'Podcasts'],
    reading: ['Textbook Reading', 'Note-Taking', 'Written Summaries', 'Practice Questions'],
    kinesthetic: ['Practice Problems', 'Lab Work', 'Case Studies', 'Interactive Simulations']
  };
  
  // Get appropriate focus areas for user's learning style
  const userFocusAreas = focusAreasByStyle[learningStyle] || [];
  
  // Additional focus areas common to all learning styles
  const commonFocusAreas = [
    'Review', 'Problem Sets', 'Exam Prep', 'Concept Mastery', 
    'Reading', 'Practice Exams', 'Project Work'
  ];
  
  const allFocusAreas = [...userFocusAreas, ...commonFocusAreas];
  
  // Helper function to format time
  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    });
  };
  
  // Helper function to check if a time slot conflicts with unavailable times
  const isTimeSlotAvailable = (day, startTime, endTime) => {
    if (!unavailableTimesByDay[day]) return true;
    
    return !unavailableTimesByDay[day].some(unavailable => {
      return (startTime < unavailable.end && endTime > unavailable.start);
    });
  };
  
  // Generate schedule for each day of the week
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const schedule = {};
  
  // Distribution strategy: distribute sessions across the week based on priority
  const totalSessions = maxSessionsPerDay * days.length;
  const courseSessions = {};
  
  // Calculate total priority points
  const totalPriorityPoints = sortedCourses.reduce((sum, course) => sum + course.priority, 0);
  
  // Distribute sessions based on priority ratios
  sortedCourses.forEach(course => {
    const sessionShare = (course.priority / totalPriorityPoints) * totalSessions;
    courseSessions[course.name] = Math.floor(sessionShare);
  });
  
  // Ensure each course gets at least one session if possible
  sortedCourses.forEach(course => {
    if (courseSessions[course.name] === 0) {
      courseSessions[course.name] = 1;
    }
  });
  
  // Check if we've allocated too many sessions and adjust if needed
  let allocatedSessions = Object.values(courseSessions).reduce((sum, count) => sum + count, 0);
  if (allocatedSessions > totalSessions) {
    // Scale down proportionally
    const scaleFactor = totalSessions / allocatedSessions;
    for (const course in courseSessions) {
      courseSessions[course] = Math.floor(courseSessions[course] * scaleFactor);
      if (courseSessions[course] === 0) courseSessions[course] = 1;
    }
    
    // Recheck total and remove from lowest priority if still too many
    allocatedSessions = Object.values(courseSessions).reduce((sum, count) => sum + count, 0);
    while (allocatedSessions > totalSessions) {
      const lowestPriorityCourse = sortedCourses[sortedCourses.length - 1].name;
      if (courseSessions[lowestPriorityCourse] > 1) {
        courseSessions[lowestPriorityCourse]--;
        allocatedSessions--;
      } else {
        // If we can't reduce the lowest priority course, try the next one
        let i = sortedCourses.length - 2;
        while (i >= 0 && allocatedSessions > totalSessions) {
          const course = sortedCourses[i].name;
          if (courseSessions[course] > 1) {
            courseSessions[course]--;
            allocatedSessions--;
          }
          i--;
        }
      }
    }
  }
  
  // Distribute study sessions across days
  const courseSessionsRemaining = {...courseSessions};
  
  days.forEach(day => {
    schedule[day] = [];
    
    // Add general review session on Sunday
    if (day === 'Sunday') {
      const randomIndex = Math.floor(Math.random() * courses.length);
      courseSessionsRemaining[courses[randomIndex].name]--;
      
      const reviewSession = {
        time: '15:00 - 16:30',
        subject: 'General Review',
        focus: 'Weekly Summary'
      };
      
      schedule[day].push(reviewSession);
    }
    
    // Calculate available session slots for this day
    let availableSlots = day === 'Sunday' ? maxSessionsPerDay - 1 : maxSessionsPerDay;
    
    // Find the best times for study sessions
    for (let slot = 0; slot < availableSlots; slot++) {
      // Find a course that still needs sessions
      let selectedCourse = null;
      for (const course of sortedCourses) {
        if (courseSessionsRemaining[course.name] > 0) {
          selectedCourse = course;
          break;
        }
      }
      
      if (!selectedCourse) continue;
      
      // Decrement remaining sessions for this course
      courseSessionsRemaining[selectedCourse.name]--;
      
      // Calculate start time for this session
      // Space sessions throughout the day
      const sessionStartHour = startTimeDate.getHours() + slot * 3; // Spread throughout the day
      const sessionStartMinute = 0;
      
      if (sessionStartHour >= endTimeDate.getHours()) continue;
      
      const sessionStart