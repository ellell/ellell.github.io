const searchInput = document.querySelector('#search');
const foodSheet = document.querySelector('[data-food-sheet]');
const clearButton = document.querySelector('[data-clear-log]');
const totalPointsNodes = document.querySelectorAll('[data-total-points]');
const canonStage = document.querySelector('.cannon-stage')

const storageKey = 'thirty-sheet-selected';
const foods = Array.isArray(window.FOODS_DATA) ? window.FOODS_DATA : [];
let selectedIds = loadSelectedIds();

function normalizeLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadSelectedIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((value) => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function saveSelectedIds() {
  window.localStorage.setItem(storageKey, JSON.stringify(Array.from(selectedIds)));
}

function getFilteredFoods(query = '') {
  const normalizedQuery = normalizeLabel(query);
  return foods.filter((food) => !normalizedQuery || food.searchKey.includes(normalizedQuery));
}

function renderSheet(query = '') {
  const visibleFoods = getFilteredFoods(query);

  if (!visibleFoods.length) {
    foodSheet.innerHTML = '<p class="empty-state">Ingen träff. Prova en annan stavning.</p>';
    return;
  }

  foodSheet.innerHTML = visibleFoods
    .sort((left, right) => left.name.localeCompare(right.name, 'sv'))
    .map((food) => `
      <label class="sheet-row">
        <span class="sheet-check">
          <input type="checkbox" data-food-id="${food.id}" ${selectedIds.has(food.id) ? 'checked' : ''} />
          <span>${food.name}</span>
        </span>
      </label>
    `)
    .join('');
}

function updateSummary() {
  const checkedFoods = foods.filter((food) => food.qualifies && selectedIds.has(food.id));
  const totalPoints = checkedFoods.reduce((sum, food) => sum + food.points, 0);

  totalPointsNodes.forEach((node) => {
    node.textContent = String(totalPoints);
  });

  const goalScore = 30;
  if (totalPoints >= goalScore) {
    canonStage.classList.add('fire')
  } else if (totalPoints < goalScore) {
    canonStage.classList.remove('fire')
  }
}

searchInput.addEventListener('input', () => {
  renderSheet(searchInput.value);
});

foodSheet.addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[type="checkbox"][data-food-id]');
  if (!checkbox) {
    return;
  }

  if (checkbox.checked) {
    selectedIds.add(checkbox.dataset.foodId);
  } else {
    selectedIds.delete(checkbox.dataset.foodId);
  }

  saveSelectedIds();
  updateSummary();
});

clearButton.addEventListener('click', () => {
  const shouldClear = confirm('Är du säker på att du vill nollställa alla kryss?');
  if (!shouldClear) {
    return;
  }
  selectedIds = new Set();
  saveSelectedIds();
  renderSheet(searchInput.value);
  updateSummary();
});

renderSheet('');
updateSummary();
