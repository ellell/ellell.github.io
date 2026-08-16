const searchInput = document.querySelector('#search');
const resultsCount = document.querySelector('[data-results-count]');
const searchResults = document.querySelector('[data-search-results]');
const logList = document.querySelector('[data-log-list]');
const countedList = document.querySelector('[data-counted-list]');
const clearButton = document.querySelector('[data-clear-log]');
const totalPointsNodes = document.querySelectorAll('[data-total-points]');
const uniqueCountNode = document.querySelector('[data-unique-count]');
const entryCountNode = document.querySelector('[data-entry-count]');

const storageKey = 'thirty-week-log';
const foods = Array.isArray(window.FOODS_DATA) ? window.FOODS_DATA : [];
const foodIndex = new Map(foods.map((food) => [food.id, food]));
let entries = loadEntries();

function normalizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadEntries() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEntries() {
  window.localStorage.setItem(storageKey, JSON.stringify(entries));
}

function formatPoints(value) {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('sv-SE', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

function getFilteredFoods(query = '') {
  const normalizedQuery = normalizeLabel(query);
  return foods
    .filter((food) => !normalizedQuery || food.searchKey.includes(normalizedQuery))
    .slice(0, 40);
}

function addEntry(foodId) {
  entries.unshift({
    foodId,
    servings: 1,
    loggedAt: new Date().toISOString(),
  });
  saveEntries();
  updateSummary();
}

function removeEntry(index) {
  entries.splice(index, 1);
  saveEntries();
  updateSummary();
}

function renderSearchResults(query = '') {
  const visibleFoods = getFilteredFoods(query);
  resultsCount.textContent = `${visibleFoods.length} träffar`;

  if (!visibleFoods.length) {
    searchResults.innerHTML = '<p class="empty-state">Ingen träff. Prova en annan stavning.</p>';
    return;
  }

  searchResults.innerHTML = visibleFoods
    .map(
      (food) => `
        <article class="result-card">
          <div>
            <p class="result-name">${food.name}</p>
            <p class="result-meta">${food.category} · underliggande växt: ${food.underlyingPlant} · ${formatPoints(food.points)} poäng</p>
          </div>
          <button class="add-button" type="button" data-food-id="${food.id}">Lägg till</button>
        </article>
      `,
    )
    .join('');
}

function scoreEntries() {
  const countedEntryIndexes = new Set();
  const seenUnderlyingPlants = new Set();
  const counted = [];
  const skipped = [];

  const resolvedEntries = entries
    .map((entry, entryIndex) => ({
      entry,
      entryIndex,
      loggedAt: entry.loggedAt || '',
    }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.loggedAt);
      const rightTime = Date.parse(right.loggedAt);
      const leftValue = Number.isNaN(leftTime) ? 0 : leftTime;
      const rightValue = Number.isNaN(rightTime) ? 0 : rightTime;

      if (leftValue === rightValue) {
        return left.entryIndex - right.entryIndex;
      }

      return leftValue - rightValue;
    });

  for (const { entry, entryIndex } of resolvedEntries) {
    const food = foodIndex.get(entry.foodId);
    if (!food || !food.qualifies) {
      continue;
    }

    if (seenUnderlyingPlants.has(food.underlyingPlantKey)) {
      continue;
    }

    seenUnderlyingPlants.add(food.underlyingPlantKey);
    countedEntryIndexes.add(entryIndex);
  }

  for (const [entryIndex, entry] of entries.entries()) {
    const food = foodIndex.get(entry.foodId);
    if (!food) {
      skipped.push({ ...entry, entryIndex, reason: 'Hittades inte i listan.' });
      continue;
    }

    if (!food.qualifies) {
      skipped.push({ ...entry, entryIndex, food, reason: 'Markerad som ej kvalificerande i källistan.' });
      continue;
    }

    if (!countedEntryIndexes.has(entryIndex)) {
      skipped.push({
        ...entry,
        entryIndex,
        food,
        reason: `Underliggande växt redan räknad: ${food.underlyingPlant}.`,
      });
      continue;
    }

    counted.push({
      entryIndex,
      food,
      servings: Math.max(1, Number(entry.servings) || 1),
      points: food.points,
      loggedAt: entry.loggedAt || new Date().toISOString(),
    });
  }

  const totalsByUnderlyingPlant = new Map();

  for (const item of counted) {
    const existing = totalsByUnderlyingPlant.get(item.food.underlyingPlantKey) || {
      id: item.food.underlyingPlantKey,
      name: item.food.underlyingPlant,
      category: item.food.category,
      points: 0,
      foods: [],
      comment: item.food.comment,
      source: item.food.source,
    };

    existing.points += item.points;
    if (!existing.foods.includes(item.food.name)) {
      existing.foods.push(item.food.name);
    }
    totalsByUnderlyingPlant.set(item.food.underlyingPlantKey, existing);
  }

  return {
    counted,
    skipped,
    totals: Array.from(totalsByUnderlyingPlant.values()).sort((left, right) => right.points - left.points || left.name.localeCompare(right.name, 'sv')),
    totalPoints: counted.reduce((sum, item) => sum + item.points, 0),
    uniqueCount: totalsByUnderlyingPlant.size,
  };
}

function renderLogItems(counted, skipped) {
  const allItems = [...counted, ...skipped]
    .sort((left, right) => left.entryIndex - right.entryIndex)
    .map((item) => {
      const isCounted = 'points' in item;
      const name = item.food?.name || item.foodId;
      const category = item.food?.category || 'Okänd kategori';
      const underlyingPlant = item.food?.underlyingPlant || 'okänd';
      const pointsLabel = isCounted ? `${formatPoints(item.points)} poäng` : '0 poäng';
      const reasonLabel = isCounted ? '' : ` · ${item.reason}`;
      const cardClassName = isCounted ? 'log-card' : 'skipped-card';

      return `
        <article class="${cardClassName}">
          <div>
            <p class="log-name">${name}</p>
            <p class="log-meta">${category} · underliggande växt: ${underlyingPlant} · ${pointsLabel}${reasonLabel} · ${formatDate(item.loggedAt)}</p>
          </div>
          <button class="remove-button" type="button" data-entry-index="${item.entryIndex}">Ta bort</button>
        </article>
      `;
    })
    .join('');

  if (!allItems) {
    logList.innerHTML = '<p class="empty-state">Inget loggat ännu. Börja med att lägga till något du har ätit.</p>';
    return;
  }

  logList.innerHTML = allItems;
}

function renderCountedTotals(totals) {
  if (!totals.length) {
    countedList.innerHTML = '<p class="empty-state">När du har loggat mat visas räknade totalsummor här.</p>';
    return;
  }

  countedList.innerHTML = totals
    .map(
      (item) => `
        <article class="counted-card">
          <div>
            <p class="result-name">${item.name}</p>
            <p class="result-meta">${item.category} · räknat från: ${item.foods.join(', ')}</p>
          </div>
          <div class="points-pill">${formatPoints(item.points)} p</div>
        </article>
      `,
    )
    .join('');
}

function updateSummary() {
  const score = scoreEntries();
  totalPointsNodes.forEach((node) => {
    node.textContent = formatPoints(score.totalPoints);
  });
  uniqueCountNode.textContent = String(score.uniqueCount);
  entryCountNode.textContent = String(score.counted.length);
  renderLogItems(score.counted, score.skipped);
  renderCountedTotals(score.totals);
}

searchInput.addEventListener('input', () => {
  renderSearchResults(searchInput.value);
});

searchResults.addEventListener('click', (event) => {
  const button = event.target.closest('[data-food-id]');
  if (!button) {
    return;
  }

  addEntry(button.dataset.foodId);
});

logList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-entry-index]');
  if (!button) {
    return;
  }

  removeEntry(Number(button.dataset.entryIndex));
});

clearButton.addEventListener('click', () => {
  entries = [];
  saveEntries();
  updateSummary();
});

renderSearchResults('');
updateSummary();