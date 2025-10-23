async function runQuery() {
  const school = document.getElementById("searchBox").value.trim();
  const queryType = document.getElementById("queryType").value;

  let url = "";
  if (queryType === "all") url = `/api/schools?name=${encodeURIComponent(school)}`;
  if (queryType === "subjects") url = `/api/schools/subjects?name=${encodeURIComponent(school)}`;
  if (queryType === "ccas") url = `/api/schools/ccas?name=${encodeURIComponent(school)}`;
  if (queryType === "programmes") url = `/api/schools/programmes?name=${encodeURIComponent(school)}`;
  if (queryType === "distinctives") url = `/api/schools/distinctives?name=${encodeURIComponent(school)}`;

  try {
    const res = await fetch(url);  // ✅ Fixed: use the 'url' variable
    const data = await res.json();
    renderTable(data);
  } catch (err) {
    document.getElementById("resultsTable").innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}

function renderTable(data) {
  if (!data || data.length === 0) {
    document.getElementById("resultsTable").innerHTML = "<p>No results found.</p>";
    return;
  }

  // If single object, wrap in array
  if (!Array.isArray(data)) {
    data = [data];
  }

  const keys = Object.keys(data[0]);
  let html = "<table><thead><tr>";
  keys.forEach(k => html += `<th>${k}</th>`);
  html += "</tr></thead><tbody>";

  data.forEach(row => {
    html += "<tr>";
    keys.forEach(k => html += `<td>${row[k]}</td>`);
    html += "</tr>";
  });

  html += "</tbody></table>";
  document.getElementById("resultsTable").innerHTML = html;
}