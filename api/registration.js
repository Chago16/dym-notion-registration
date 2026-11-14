
const { Client } = require("@notionhq/client");
const { getDatabaseId, getDataSourceId } = require("./notion-config");

const notion = new Client({
  auth: process.env.NOTION_API_KEY
});

const ATTENDEES_DB = getDatabaseId(
  process.env.NOTION_ATTENDEES_DB_ID,
  "NOTION_ATTENDEES_DB_ID"
);
const ATTENDANCE_DB = getDatabaseId(
  process.env.NOTION_ATTENDANCE_DB_ID,
  "NOTION_ATTENDANCE_DB_ID"
);
const ATTENDANCE_DATA_SOURCE = getDataSourceId(
  notion,
  ATTENDANCE_DB,
  "NOTION_ATTENDANCE_DB_ID"
);

const NAME_PROPERTY = process.env.ATTENDEE_NAME_PROPERTY || "Name";
const BIRTHDAY_PROPERTY = "Birthdate";
const CONTACT_PROPERTY = "Contact";
const FB_PROPERTY = process.env.ATTENDEE_FB_PROPERTY || "FB Link";

const RELATION_PROPERTY = "Attendees";
const DATE_PROPERTY = "Date";
const TITLE_PROPERTY = "Week & Month";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  let attendeeId;

  try {
    const {
      type,
      name,
      birthday,
      contact,
      fbLink,
      serviceDate
    } = req.body || {};

    // Validate service date
    if (
      typeof serviceDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ||
      !Number.isFinite(Date.parse(serviceDate + "T00:00:00Z")) ||
      new Date(serviceDate + "T00:00:00Z").toISOString().slice(0, 10) !== serviceDate
    ) {
      return res.status(400).json({
        error: "Please provide a valid service date."
      });
    }

    // Get existing attendee
    if (type === "existing") {
      if (typeof req.body.attendeeId !== "string") {
        return res.status(400).json({
          error: "Invalid attendee."
        });
      }

      attendeeId = req.body.attendeeId;

      // Verify attendee exists
      const attendee = await notion.pages.retrieve({
        page_id: attendeeId
      });

      if (attendee.archived || attendee.in_trash) {
        return res.status(404).json({
          error: "Attendee not found."
        });
      }

      const actualTitle = attendee.properties[NAME_PROPERTY]
        ?.title?.map(item => item.plain_text).join("");

      if (!actualTitle) {
        return res.status(400).json({
          error: "Invalid attendee record."
        });
      }
    }

    // Create new attendee
    else if (type === "new") {
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 150
      ) {
        return res.status(400).json({
          error: "Please provide a valid attendee name."
        });
      }

      const properties = {
        [NAME_PROPERTY]: {
          title: [
            {
              text: {
                content: name.trim()
              }
            }
          ]
        }
      };

      // Optional birthday
      if (birthday) {
        properties[BIRTHDAY_PROPERTY] = {
          date: { start: birthday }
        };
      }

      // Optional contact
      if (contact) {
        const contactNumber = Number(contact);

        if (!Number.isSafeInteger(contactNumber) || contactNumber < 0) {
          return res.status(400).json({
            error: "Please provide a valid contact number."
          });
        }

        properties[CONTACT_PROPERTY] = {
          number: contactNumber
        };
      }

      // Optional Facebook URL
      if (fbLink) {
        const validUrl = validateFacebookUrl(fbLink);

        if (!validUrl) {
          return res.status(400).json({
            error: "Please provide a valid Facebook URL."
          });
        }

        properties[FB_PROPERTY] = {
          url: validUrl
        };
      }

      const newAttendee = await notion.pages.create({
        parent: {
          database_id: ATTENDEES_DB
        },
        properties
      });

      attendeeId = newAttendee.id;
    }

    else {
      return res.status(400).json({
        error: "Invalid registration type."
      });
    }

    const attendanceTitle = getWeekAndMonthTitle(serviceDate);
    const existingAttendance = await notion.dataSources.query({
      data_source_id: await ATTENDANCE_DATA_SOURCE,
      filter: {
        property: TITLE_PROPERTY,
        title: {
          equals: attendanceTitle
        }
      },
      page_size: 1
    });

    if (existingAttendance.results.length > 0) {
      const attendancePage = existingAttendance.results[0];
      const attendees = attendancePage.properties[RELATION_PROPERTY]?.relation || [];

      if (attendees.some(attendee => attendee.id === attendeeId)) {
        return res.status(409).json({
          error: "This attendee is already registered for this week."
        });
      }

      await notion.pages.update({
        page_id: attendancePage.id,
        properties: {
          [RELATION_PROPERTY]: {
            relation: [
              ...attendees.map(attendee => ({ id: attendee.id })),
              { id: attendeeId }
            ]
          }
        }
      });
    } else {
      await notion.pages.create({
        parent: {
          database_id: ATTENDANCE_DB
        },
        properties: {
          [TITLE_PROPERTY]: {
            title: [
              {
                text: {
                  content: attendanceTitle
                }
              }
            ]
          },
          [RELATION_PROPERTY]: {
            relation: [{ id: attendeeId }]
          },
          [DATE_PROPERTY]: {
            date: { start: serviceDate }
          }
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: type === "new"
        ? "New visitor and attendance successfully registered!"
        : "Attendance successfully registered!",
      attendeeId
    });

  } catch (error) {
    console.error("Registration error:", error);

    return res.status(500).json({
      error: attendeeId && req.body?.type === "new"
        ? "Attendee may have been created, but attendance registration failed. Check Notion before retrying."
        : "Unable to complete registration. Please try again."
    });
  }
};

function validateFacebookUrl(value) {
  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "www.fb.com"].includes(url.hostname)
    ) {
      return null;
    }

    return url.toString();

  } catch {
    return null;
  }
}

function getWeekAndMonthTitle(serviceDate) {
  const date = new Date(`${serviceDate}T00:00:00Z`);
  const weekNumber = Math.ceil(date.getUTCDate() / 7);
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC"
  }).format(date);

  return `${getOrdinal(weekNumber)} Week of ${month}`;
}

function getOrdinal(number) {
  if (number % 100 >= 11 && number % 100 <= 13) {
    return `${number}th`;
  }

  return `${number}${{
    1: "st",
    2: "nd",
    3: "rd"
  }[number % 10] || "th"}`;
}
