function getDatabaseId(value, variableName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${variableName} is not configured.`);
  }

  const input = value.trim();
  let id = input;

  try {
    const url = new URL(input);
    const pathId = url.pathname.match(/\/(?:p|[\w-]+)\/([a-f0-9]{32}|[a-f0-9-]{36})/i)?.[1];

    if (pathId) {
      id = pathId;
    }
  } catch {
    // The value may already be a database ID.
  }

  const compactId = id.replace(/-/g, "");

  if (!/^[a-f0-9]{32}$/i.test(compactId)) {
    throw new Error(`${variableName} must be a Notion database ID or URL.`);
  }

  return compactId.replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    "$1-$2-$3-$4-$5"
  );
}

async function getDataSourceId(notion, databaseId, variableName) {
  const database = await notion.databases.retrieve({
    database_id: databaseId
  });
  const dataSource = database.data_sources?.[0];

  if (!dataSource?.id) {
    throw new Error(`${variableName} has no accessible data source.`);
  }

  return dataSource.id;
}

module.exports = {
  getDatabaseId,
  getDataSourceId
};
