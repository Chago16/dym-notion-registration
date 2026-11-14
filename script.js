
const serviceDateInput = document.getElementById("serviceDate");
const searchInput = document.getElementById("search");
const results = document.getElementById("results");
const message = document.getElementById("message");

let selectedAttendee = null;
let searchTimeout = null;
let submitting = false;

// Default service date to today
const today = new Date();
const localToday = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, "0"),
  String(today.getDate()).padStart(2, "0")
].join("-");

serviceDateInput.value = localToday;

// Search existing attendees
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimeout);
  selectedAttendee = null;

  document.getElementById("selectedSection")
    .classList.add("hidden");

  const query = searchInput.value.trim();

  if (query.length < 2) {
    results.replaceChildren();
    return;
  }

  searchTimeout = setTimeout(() => searchAttendees(query), 350);
});

async function searchAttendees(query) {
  results.textContent = "Searching...";

  try {
    const response = await fetch(
      `/api/attendees?q=${encodeURIComponent(query)}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Search failed.");
    }

    results.replaceChildren();

    if (data.length === 0) {
      results.textContent = "No attendee found.";
      return;
    }

    data.forEach(person => {
      const item = document.createElement("div");
      item.className = "result";
      item.textContent = person.name;

      item.addEventListener("click", () => {
        selectAttendee(person);
      });

      results.appendChild(item);
    });

  } catch (error) {
    results.textContent = error.message;
  }
}

// Select attendee
function selectAttendee(person) {
  selectedAttendee = person;

  document.getElementById("selectedName").textContent =
    person.name;

  document.getElementById("selectedSection")
    .classList.remove("hidden");

  results.replaceChildren();
}

// Register existing attendee
document.getElementById("registerExistingBtn")
  .addEventListener("click", async () => {

    if (!selectedAttendee) return;

    await submitRegistration({
      type: "existing",
      attendeeId: selectedAttendee.id,
      serviceDate: serviceDateInput.value
    });
  });

// Register new visitor
document.getElementById("newVisitorForm")
  .addEventListener("submit", async (event) => {

    event.preventDefault();

    await submitRegistration({
      type: "new",
      name: document.getElementById("newName").value.trim(),
      birthday: document.getElementById("newBirthday").value,
      contact: document.getElementById("newContact").value.trim(),
      fbLink: document.getElementById("newFbLink").value.trim(),
      serviceDate: serviceDateInput.value
    });
  });

// Submit registration
async function submitRegistration(data) {
  if (submitting) return;

  if (!data.serviceDate) {
    showMessage("Please select a service date.", "error");
    return;
  }

  submitting = true;

  const buttons = document.querySelectorAll("button");
  buttons.forEach(button => button.disabled = true);

  showMessage("Processing registration...", "");

  try {
    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Registration failed.");
    }

    showMessage(result.message, "success");

    // Reset registration fields
    selectedAttendee = null;
    searchInput.value = "";
    results.replaceChildren();

    document.getElementById("selectedSection")
      .classList.add("hidden");

    document.getElementById("newVisitorForm").reset();

  } catch (error) {
    showMessage(error.message, "error");

  } finally {
    submitting = false;
    buttons.forEach(button => button.disabled = false);
  }
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = type;
}
