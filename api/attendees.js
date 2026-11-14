
const { Client } = require("@notionhq/client");
const { getDatabaseId } = require("./notion-config");

const notion = new Client({
  auth: process.env.NOTION_API_KEY
});
const attendeesDatabaseId = getDatabaseId(
  process.env.NOTION_ATTENDEES_DB_ID,
  "NOTION_ATTENDEES_DB_ID"
);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const query = (req.query.q || "").trim();

  if (query.length < 2 || query.length > 100) {
    return res.status(200).json([]);
  }

  try {
    const response = await notion.databases.query({
      database_id: attendeesDatabaseId,
      filter: {
        property: process.env.ATTENDEE_NAME_PROPERTY || "Name",
        title: {
          contains: query
        }
      },
      page_size: 20,
      sorts: [
        {
          property: process.env.ATTENDEE_NAME_PROPERTY || "Name",
          direction: "ascending"
        }
      ]
    });

    const attendees = response.results.map(page => ({
      id: page.id,
      name:
        page.properties[
          process.env.ATTENDEE_NAME_PROPERTY || "Name"
        ]?.title?.map(item => item.plain_text).join("") || "Unnamed"
    }));

    return res.status(200).json(attendees);

  } catch (error) {
    console.error("Notion search error:", error);

    return res.status(500).json({
      error: "Unable to search attendees."
    });
  }
};
