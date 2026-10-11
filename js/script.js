/* ========================================================================
   SCRIPT.JS - Ricette PWA (versione con JSONBin + ottimizzazioni mobile)
   ======================================================================== */

/* ---------------- CONFIGURAZIONE JSONBIN ---------------- */
const JSONBIN_KEY = '$2a$10$O9DeoNpqBSYwuBJUsebAdON/SGrC8KTJ/btm8DGG/LxCTplTcq7LO';
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';
const BIN_INGREDIENTI = '6aca9155ffd5d160535fd1cb';
const BIN_RICETTE = '6aca9274ffd5d160535fd489';
const BIN_PREPARAZIONI = '6aca92d1ffd5d160535fd530';
const BIN_ORDINI = '6acbe727ac6210605a28abc2';

/* ---------------- CACHE LOCALE (fallback offline) ---------------- */
const LS_ING = 'ricette_cache_ingredienti';
const LS_RIC = 'ricette_cache_ricette';
const LS_PREP = 'ricette_cache_preparazioni';
const LS_ORD = 'ricette_cache_ordini';

let ingredienti = [];
let ricette = [];
let preparazioni = [];
let ordini = [];

/* ALLERGENI */
const ALLERGEN_LIST = [
  {code:'A01', name:'Cereali con glutine'},
  {code:'A02', name:'Crostacei'},
  {code:'A03', name:'Uova'},
  {code:'A04', name:'Pesce'},
  {code:'A05', name:'Arachidi'},
  {code:'A06', name:'Soia'},
  {code:'A07', name:'Latte'},
  {code:'A08', name:'Frutta a guscio'},
  {code:'A09', name:'Sedano'},
  {code:'A10', name:'Senape'},
  {code:'A11', name:'Sesamo'},
  {code:'A12', name:'Anidride solforosa'},
  {code:'A13', name:'Lupini'},
  {code:'A14', name:'Molluschi'}
];

/* ========================================================================
   JSONBIN: LETTURA E SCRITTURA
   ======================================================================== */

async function jsonbinRead(binId) {
  const resp = await fetch(`${JSONBIN_BASE}/${binId}/latest`, {
    headers: { 'X-Master-Key': JSONBIN_KEY }
  });
  if (!resp.ok) throw new Error('JSONBin read error: ' + resp.status);
  const j = await resp.json();
  return j.record || [];
}

async function jsonbinWrite(binId, data) {
  const resp = await fetch(`${JSONBIN_BASE}/${binId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': JSONBIN_KEY
    },
    body: JSON.stringify(data)
  });
  if (!resp.ok) throw new Error('JSONBin write error: ' + resp.status);
  return true;
}

/* ---------------- SALVATAGGI CON FALLBACK LOCALE ---------------- */

async function saveIngredienti(arr) {
  try {
    await jsonbinWrite(BIN_INGREDIENTI, arr);
    ingredienti = arr;
    localStorage.setItem(LS_ING, JSON.stringify(arr));
    return true;
  } catch (e) {
    console.warn('Salvataggio ingredienti fallito, cache locale aggiornata', e);
    localStorage.setItem(LS_ING, JSON.stringify(arr));
    return false;
  }
}

async function saveRicette(arr) {
  try {
    await jsonbinWrite(BIN_RICETTE, arr);
    ricette = arr;
    localStorage.setItem(LS_RIC, JSON.stringify(arr));
    return true;
  } catch (e) {
    console.warn('Salvataggio ricette fallito, cache locale aggiornata', e);
    localStorage.setItem(LS_RIC, JSON.stringify(arr));
    return false;
  }
}

async function savePreparazioni(arr) {
  try {
    await jsonbinWrite(BIN_PREPARAZIONI, arr);
    preparazioni = arr;
    localStorage.setItem(LS_PREP, JSON.stringify(arr));
    return true;
  } catch (e) {
    console.warn('Salvataggio preparazioni fallito, cache locale aggiornata', e);
    localStorage.setItem(LS_PREP, JSON.stringify(arr));
    return false;
  }
}

/* ---------------- LOAD DATA (con fallback localStorage) ---------------- */

async function loadData(forceRemote = false) {
  // 1) prova prima la cache locale per reattività immediata
  if (!forceRemote) {
    try {
      const ci = localStorage.getItem(LS_ING);
      const cr = localStorage.getItem(LS_RIC);
      const cp = localStorage.getItem(LS_PREP);
      if (ci) ingredienti = JSON.parse(ci);
      if (cr) ricette = JSON.parse(cr);
      if (cp) preparazioni = JSON.parse(cp);
    } catch (e) { /* ignore */ }
  }

  // 2) poi sincronizza con JSONBin in background
  try {
    const [ing, ric, prep] = await Promise.all([
      jsonbinRead(BIN_INGREDIENTI).catch(() => null),
      jsonbinRead(BIN_RICETTE).catch(() => null),
      jsonbinRead(BIN_PREPARAZIONI).catch(() => null)
    ]);
    if (Array.isArray(ing)) {
      ingredienti = ing;
      localStorage.setItem(LS_ING, JSON.stringify(ing));
    }
    if (Array.isArray(ric)) {
      ricette = ric;
      localStorage.setItem(LS_RIC, JSON.stringify(ric));
    }
    if (Array.isArray(prep)) {
      preparazioni = prep;
      localStorage.setItem(LS_PREP, JSON.stringify(prep));
    }
  } catch (e) {
    console.warn('Lettura JSONBin fallita, uso cache locale', e);
  }
}

/* ========================================================================
   INDEX PAGE (ricette + preparazioni)
   ======================================================================== */
async function initIndexPage() {
  await loadData();
  const recipesList = document.getElementById('recipesList');
  const basesList = document.getElementById('basesList');
  const search = document.getElementById('searchInput');

  function render() {
    recipesList.innerHTML = '';
    basesList.innerHTML = '';

    const sortedRicette = [...ricette].sort((a, b) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    );
    const sortedPreparazioni = [...preparazioni].sort((a, b) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    );

    sortedRicette.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${r.name}</span><small class="mute"> porz: ${r.portions || 1}</small>`;
      li.addEventListener('click', () => window.location.href = `ricetta.html?id=${encodeURIComponent(r.id)}`);
      recipesList.appendChild(li);
    });

    sortedPreparazioni.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${p.name}</span><small class="mute"> preparazione base</small>`;
      li.addEventListener('click', () => {
        window.location.href = `modifica-preparazione-base.html?id=${encodeURIComponent(p.id)}`;
      });
      basesList.appendChild(li);
    });
  }

  render();

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    Array.from(recipesList.children).forEach(li => {
      li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    Array.from(basesList.children).forEach(li => {
      li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

/* ========================================================================
   PREPARATIONS PAGE
   ======================================================================== */
async function initPreparationsPage() {
  await loadData();
  const list = document.getElementById('prepsList');
  const search = document.getElementById('baseSearch');

  function render() {
    list.innerHTML = '';
    const sortedPreparazioni = [...preparazioni].sort((a, b) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    );

    sortedPreparazioni.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${p.name}</span>
                      <div>
                        <button class="btn btn-small" data-id="${p.id}" data-act="open">Apri</button>
                        <button class="btn btn-small" data-id="${p.id}" data-act="del">Elimina</button>
                      </div>`;
      list.appendChild(li);
    });

    list.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', async (ev) => {
        const id = ev.currentTarget.dataset.id;
        const act = ev.currentTarget.dataset.act;
        if (act === 'open') window.location.href = `modifica-preparazione-base.html?id=${encodeURIComponent(id)}`;
        if (act === 'del') {
          if (!confirm('Eliminare preparazione?')) return;
          const others = preparazioni.filter(x => x.id !== id);
          await savePreparazioni(others);
          render();
        }
      });
    });
  }

  render();

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    Array.from(list.children).forEach(li => {
      const text = li.querySelector('span').textContent.toLowerCase();
      li.style.display = text.includes(q) ? '' : 'none';
    });
  });
}

/* ========================================================================
   EDIT PREPARATION PAGE
   ======================================================================== */
async function initEditPreparationPage() {
  await loadData();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const form = document.getElementById('prepForm');
  const sel = document.getElementById('prepIngredientSelect');
  const qty = document.getElementById('prepIngredientQty');
  const unitSel = document.getElementById('prepIngredientUnit');
  const addBtn = document.getElementById('addPrepIngredientBtn');
  const list = document.getElementById('prepIngredientsList');
  const totalCostDiv = document.getElementById('prepTotalCost');
  const totalCostValue = document.getElementById('prepTotalCostValue');

  const sortedIngredients = [...ingredienti].sort((a, b) => a.name.localeCompare(b.name));
  sortedIngredients.forEach(i => {
    const o = document.createElement('option');
    o.value = i.id;
    o.textContent = i.name;
    sel.appendChild(o);
  });

  sel.addEventListener('change', () => {
    const ing = ingredienti.find(x => x.id === sel.value);
    unitSel.innerHTML = '';
    const o = document.createElement('option');
    o.value = ing ? ing.unit : 'g';
    o.textContent = ing ? ing.unit : 'g';
    unitSel.appendChild(o);
  });

  function calculateTotalCost() {
    let total = 0;
    const items = Array.from(list.querySelectorAll('li'));
    items.forEach(li => {
      const itemId = li.dataset.id;
      const itemQty = Number(li.dataset.qty) || 0;
      const itemUnit = li.dataset.unit || 'g';
      const ing = ingredienti.find(i => String(i.id) === String(itemId));
      if (ing) total += computeCostForIngredient(ing, itemQty, itemUnit);
    });
    if (items.length > 0) {
      totalCostDiv.style.display = 'block';
      totalCostValue.textContent = `€ ${total.toFixed(2)}`;
    } else {
      totalCostDiv.style.display = 'none';
    }
    return total;
  }

  function addLine(item) {
    const ingObj = ingredienti.find(i => String(i.id) === String(item.id));
    const cost = ingObj ? computeCostForIngredient(ingObj, item.qty, item.unit) : 0;

    const li = document.createElement('li');
    li.dataset.id = item.id;
    li.dataset.qty = item.qty;
    li.dataset.unit = item.unit;

    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.justifyContent = 'space-between';
    container.style.alignItems = 'center';
    container.style.width = '100%';

    const textDiv = document.createElement('div');
    textDiv.innerHTML = `<span>${ingObj ? ingObj.name : item.id} — ${item.qty}${item.unit || ''}</span>`;

    const costDiv = document.createElement('div');
    costDiv.style.display = 'flex';
    costDiv.style.alignItems = 'center';
    costDiv.style.gap = '10px';
    costDiv.innerHTML = `<span style="color: var(--blue-light); font-weight: 600;">€ ${cost.toFixed(2)}</span>`;

    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Elimina';
    del.addEventListener('click', () => {
      li.remove();
      calculateTotalCost();
      sortIngredientsList(list);
    });

    costDiv.appendChild(del);
    container.appendChild(textDiv);
    container.appendChild(costDiv);
    li.appendChild(container);
    list.appendChild(li);

    calculateTotalCost();
    sortIngredientsList(list);
  }

  function sortIngredientsList(listElement) {
    const items = Array.from(listElement.children);
    items.sort((a, b) => a.textContent.toLowerCase().localeCompare(b.textContent.toLowerCase(), 'it', { sensitivity: 'base' }));
    items.forEach(item => listElement.appendChild(item));
  }

  if (id) {
    const editing = preparazioni.find(p => String(p.id) === String(id));
    if (editing) {
      form.name.value = editing.name;
      form.preparation.value = editing.preparation || '';
      (editing.ingredients || []).forEach(it => addLine(it));
      calculateTotalCost();
    }
  }

  addBtn.addEventListener('click', () => {
    if (!sel.value) return alert('Seleziona ingrediente');
    const it = { id: sel.value, qty: Number(qty.value) || 0, unit: unitSel.value || 'g' };
    addLine(it);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const p = {
      id: id || `pb${Date.now()}`,
      name: form.name.value,
      preparation: form.preparation.value,
      ingredients: Array.from(list.querySelectorAll('li')).map(li => ({
        id: li.dataset.id, qty: Number(li.dataset.qty), unit: li.dataset.unit
      }))
    };
    const others = preparazioni.filter(x => String(x.id) !== String(p.id));
    others.push(p);
    await savePreparazioni(others);
    window.location.href = 'preparazioni-base.html';
  });
}

/* ========================================================================
   INGREDIENTI PAGE
   ======================================================================== */
async function initIngredientPage() {
  await loadData();

  ingredienti.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  const tbody = document.querySelector('#ingredientTable tbody');
  const search = document.getElementById('ingredientSearch');

  function render() {
    tbody.innerHTML = '';

    ingredienti.forEach(i => {
      const allergenHtml = (i.allergeni || []).map(a => {
        const allergen = ALLERGEN_LIST.find(x => x.code === a);
        const displayName = allergen ? allergen.name : a;
        const shortName = displayName.length > 20 ? displayName.substring(0, 18) + '...' : displayName;
        return `<span class="allergen-tag" title="${displayName}">${shortName}</span>`;
      }).join(' ');

      const macroHtml = i.macro ?
        `kcal:${i.macro.kcal}<br>prot:${i.macro.prot || 0}<br>carb:${i.macro.carb || 0}<br>fat:${i.macro.fat || 0}` :
        '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${i.name}</strong></td>
        <td>€ ${Number(i.price || 0).toFixed(2)}<br><small class="mute">${i.priceUnit || 'kg'}</small></td>
        <td>${i.unit || ''}</td>
        <td>${allergenHtml || '<span class="mute">nessuno</span>'}</td>
        <td><small>${macroHtml}</small></td>
        <td>
          <button data-id="${i.id}" class="btn btn-small editIng">Modifica</button>
          <button data-id="${i.id}" class="btn btn-small duplicateIng">Duplica</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.editIng').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        window.location.href = `modifica-ingrediente.html?id=${encodeURIComponent(id)}`;
      });
    });

    tbody.querySelectorAll('.duplicateIng').forEach(b => {
      b.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const original = ingredienti.find(i => String(i.id) === String(id));
        if (!original) return;

        const duplicate = {
          ...JSON.parse(JSON.stringify(original)),
          id: `i${Date.now()}`,
          name: `${original.name} (copia)`
        };
        ingredienti.push(duplicate);
        ingredienti.sort((a, b) => a.name.localeCompare(b.name));

        const ok = await saveIngredienti(ingredienti);
        if (ok) {
          alert('Ingrediente duplicato e salvato!');
          render();
        } else {
          alert('Salvataggio online fallito. Dati salvati localmente.');
          render();
        }
      });
    });
  }

  render();

  search.addEventListener('input', () => {
    const query = search.value.toLowerCase().trim();
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const text = tr.textContent.toLowerCase();
      tr.style.display = (query === '' || text.includes(query)) ? '' : 'none';
    });
  });
}

/* ========================================================================
   EDIT INGREDIENT PAGE
   ======================================================================== */
async function initEditIngredientPage() {
  await loadData();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const form = document.getElementById('ingredientForm');
  const checkContainer = document.getElementById('allergenCheckboxes');
  const priceUnitSelect = document.getElementById('priceUnit');

  ALLERGEN_LIST.forEach(a => {
    const wrapper = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = a.code;
    cb.name = 'allergeni';
    wrapper.appendChild(cb);
    wrapper.appendChild(document.createTextNode(' ' + a.name));
    checkContainer.appendChild(wrapper);
  });

  let editing = null;
  if (id) {
    editing = ingredienti.find(i => String(i.id) === String(id));
    if (editing) {
      form.name.value = editing.name || '';
      form.price.value = editing.price || '';
      form.unit.value = editing.unit || '';
      priceUnitSelect.value = editing.priceUnit || 'kg';
      form.macro.value = (editing.macro) ? `${editing.macro.kcal},${editing.macro.prot || 0},${editing.macro.carb || 0},${editing.macro.fat || 0}` : '';
      (editing.allergeni || []).forEach(code => {
        const c = checkContainer.querySelector(`input[value="${code}"]`);
        if (c) c.checked = true;
      });
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const m = (form.macro.value || '').split(',').map(x => Number(x.trim()));
    const selectedAll = Array.from(checkContainer.querySelectorAll('input[name="allergeni"]:checked')).map(x => x.value);

    const obj = {
      id: id || `i${Date.now()}`,
      name: form.name.value,
      price: Number(form.price.value) || 0,
      priceUnit: priceUnitSelect.value || 'kg',
      unit: form.unit.value || 'g',
      unitRef: 100,
      macro: { kcal: m[0] || 0, prot: m[1] || 0, carb: m[2] || 0, fat: m[3] || 0 },
      allergeni: selectedAll,
      weightPerPiece: null
    };

    const others = ingredienti.filter(x => String(x.id) !== String(obj.id));
    others.push(obj);
    others.sort((a, b) => a.name.localeCompare(b.name));

    const ok = await saveIngredienti(others);
    if (ok) {
      alert('Ingrediente salvato online.');
    } else {
      alert('Salvataggio online fallito. Salvato localmente.');
    }
    window.location.href = 'ingredienti.html';
  });
}

/* ========================================================================
   HELPERS: costi e macro
   ======================================================================== */
function computeCostForIngredient(ing, qty, unitInRecipe) {
  const price = Number(ing.price || 0);
  const pu = ing.priceUnit || 'kg';
  const ingUnit = (ing.unit || 'g').toLowerCase();
  const u = (unitInRecipe || ingUnit).toLowerCase();

  if (u === 'min' || u === 'minuti') {
    if (pu === 'h') return (qty / 60) * price;
  }
  if (pu === 'pcs') return qty * price;
  if (pu === 'kg') {
    if (u === 'g' || u === 'gr' || u === 'grammi') return (qty / 1000) * price;
    if (u === 'pcs') {
      if (ing.weightPerPiece) return ((qty * ing.weightPerPiece) / 1000) * price;
      return 0;
    }
  }
  if (pu === 'l') {
    if (u === 'ml') return (qty / 1000) * price;
  }
  if (pu === 'h') {
    if (u === 'h' || u === 'ora' || u === 'ore') return qty * price;
  }
  return 0;
}

function computeMacroForIngredient(ing, qty, unitInRecipe) {
  const u = (unitInRecipe || ing.unit || 'g').toLowerCase();
  if (u === 'min' || u === 'minuti' || u === 'h' || u === 'ora' || u === 'ore') {
    return { kcal: 0, prot: 0, carb: 0, fat: 0 };
  }
  if (u === 'g' || u === 'gr' || u === 'grammi') {
    const factor = qty / 100;
    return {
      kcal: (ing.macro?.kcal || 0) * factor,
      prot: (ing.macro?.prot || 0) * factor,
      carb: (ing.macro?.carb || 0) * factor,
      fat: (ing.macro?.fat || 0) * factor
    };
  }
  if (u === 'pcs' && ing.weightPerPiece) {
    const grams = qty * ing.weightPerPiece;
    const factor = grams / 100;
    return {
      kcal: (ing.macro?.kcal || 0) * factor,
      prot: (ing.macro?.prot || 0) * factor,
      carb: (ing.macro?.carb || 0) * factor,
      fat: (ing.macro?.fat || 0) * factor
    };
  }
  return { kcal: 0, prot: 0, carb: 0, fat: 0 };
}

/* ========================================================================
   RECIPE PAGE
   ======================================================================== */
async function initRecipePage() {
  await loadData();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const recipe = ricette.find(r => String(r.id) === String(id));

  if (!recipe) {
    document.getElementById('recipeTitle').textContent = 'Ricetta non trovata';
    return;
  }

  document.getElementById('recipeTitle').textContent = recipe.name;
  document.getElementById('recipeTime').textContent = recipe.time || '';
  document.getElementById('recipeDiff').textContent = recipe.difficulty || '';
  document.getElementById('recipePortionsBase').textContent = recipe.portions || 1;
  document.getElementById('recipePortions').value = recipe.portions || 1;
  if (recipe.image) document.getElementById('recipeImage').src = `images/${recipe.image}`;

  if (recipe.weightPerPortion) {
    const weightInfo = document.getElementById('recipeWeightInfo');
    weightInfo.textContent = `Peso/porzione: ${recipe.weightPerPortion}g`;
    weightInfo.style.display = 'inline-block';

    document.getElementById('weightControl').style.display = 'block';
    document.getElementById('weightPerPortionValue').textContent = recipe.weightPerPortion;
    document.getElementById('totalWeightBox').style.display = 'block';
  }

  let currentPortions = Number(recipe.portions || 1);
  let totalRecipeWeight = 0;

  function gatherAllIngredients(forPortions) {
    const result = [];
    (recipe.ingredients || []).forEach(it => {
      result.push({ ...it, source: 'recipe', parentBase: null });
    });
    (recipe.importedBases || []).forEach(baseId => {
      const base = preparazioni.find(p => String(p.id) === String(baseId));
      if (!base) return;
      (base.ingredients || []).forEach(it => {
        result.push({ id: it.id, qty: it.qty || 0, unit: it.unit || 'g', source: 'base', parentBase: baseId });
      });
    });
    const factor = forPortions / (recipe.portions || 1);
    return result.map(it => ({ id: it.id, qty: (it.qty || 0) * factor, unit: it.unit || 'g', source: it.source, parentBase: it.parentBase }));
  }

  function renderIngredients(forPortions) {
    currentPortions = forPortions;
    const tbody = document.querySelector('#ingredientsTable tbody');
    tbody.innerHTML = '';
    const all = gatherAllIngredients(forPortions);

    const agg = {};
    all.forEach(it => {
      const key = it.id + '|' + (it.unit || '');
      if (!agg[key]) {
        agg[key] = { id: it.id, qty: 0, unit: it.unit, parentBases: new Set() };
      }
      agg[key].qty += it.qty;
      if (it.parentBase) agg[key].parentBases.add(it.parentBase);
    });

    let totalCost = 0;
    let totalMacro = { kcal: 0, prot: 0, carb: 0, fat: 0 };
    let allergenCodes = new Set();
    totalRecipeWeight = 0;

    const sortedAgg = Object.values(agg).sort((a, b) => {
      const ingA = ingredienti.find(i => String(i.id) === String(a.id));
      const ingB = ingredienti.find(i => String(i.id) === String(b.id));
      const nameA = ingA ? ingA.name.toLowerCase() : '';
      const nameB = ingB ? ingB.name.toLowerCase() : '';
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' });
    });

    sortedAgg.forEach(a => {
      const ing = ingredienti.find(i => String(i.id) === String(a.id));
      const qtyAdjusted = a.qty;
      const unit = a.unit;
      let cost = 0;
      let macros = { kcal: 0, prot: 0, carb: 0, fat: 0 };

      if (ing) {
        cost = computeCostForIngredient(ing, qtyAdjusted, unit);
        macros = computeMacroForIngredient(ing, qtyAdjusted, unit);
        totalMacro.kcal += macros.kcal;
        totalMacro.prot += macros.prot;
        totalMacro.carb += macros.carb;
        totalMacro.fat += macros.fat;
        (ing.allergeni || []).forEach(x => allergenCodes.add(x));

        if (unit === 'g' || unit === 'gr' || unit === 'grammi') totalRecipeWeight += qtyAdjusted;
        else if (unit === 'pcs' && ing.weightPerPiece) totalRecipeWeight += qtyAdjusted * ing.weightPerPiece;
        else if (unit === 'ml') totalRecipeWeight += qtyAdjusted * 1;
      }

      totalCost += cost;

      let displayUnit = unit;
      if (unit === 'min') displayUnit = 'min';

      let sourceIndicator = '';
      if (a.parentBases.size > 0) {
        const baseNames = Array.from(a.parentBases).map(baseId => {
          const base = preparazioni.find(p => String(p.id) === String(baseId));
          return base ? base.name : baseId;
        });
        sourceIndicator = `<br><small class="mute">da: ${baseNames.join(', ')}</small>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${ing ? ing.name : a.id}</strong>${sourceIndicator}</td>
        <td>${(qtyAdjusted).toFixed(1)}</td>
        <td>${displayUnit}</td>
        <td><strong>€ ${cost.toFixed(2)}</strong></td>
        <td><strong>${macros.kcal.toFixed(1)}</strong></td>
        <td>${macros.fat.toFixed(1)}g</td>
        <td>${macros.carb.toFixed(1)}g</td>
        <td>${macros.prot.toFixed(1)}g</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('totalCost').textContent = `€ ${totalCost.toFixed(2)}`;
    document.getElementById('totalKcal').textContent = totalMacro.kcal.toFixed(1);
    document.getElementById('totalFat').textContent = `${totalMacro.fat.toFixed(1)}g`;
    document.getElementById('totalCarb').textContent = `${totalMacro.carb.toFixed(1)}g`;
    document.getElementById('totalProt').textContent = `${totalMacro.prot.toFixed(1)}g`;

    const portionCost = totalCost / forPortions;
    document.getElementById('totalCostBox').textContent = `€ ${totalCost.toFixed(2)}`;
    document.getElementById('portionCost').textContent = `€ ${portionCost.toFixed(2)}`;
    document.getElementById('totalKcalBox').textContent = `${Math.round(totalMacro.kcal)} kcal`;
    document.getElementById('totalProtBox').textContent = `${Math.round(totalMacro.prot)}g`;
    document.getElementById('totalCarbBox').textContent = `${Math.round(totalMacro.carb)}g`;
    document.getElementById('totalFatBox').textContent = `${Math.round(totalMacro.fat)}g`;

    if (recipe.weightPerPortion) {
      const expectedWeight = (forPortions / recipe.portions) * recipe.weightPerPortion;
      const costPer100g = (totalCost / expectedWeight) * 100;
      const kcalPer100g = (totalMacro.kcal / expectedWeight) * 100;

      document.getElementById('costPer100g').style.display = 'flex';
      document.getElementById('costPer100gValue').textContent = `€ ${costPer100g.toFixed(2)}`;
      document.getElementById('macroPer100g').style.display = 'block';
      document.getElementById('kcalPer100g').textContent = `${Math.round(kcalPer100g)} kcal`;
      document.getElementById('totalWeightValue').textContent = `${Math.round(totalRecipeWeight)} g`;
    } else {
      document.getElementById('costPer100g').style.display = 'none';
      document.getElementById('macroPer100g').style.display = 'none';
      document.getElementById('totalWeightBox').style.display = 'none';
    }

    const codes = Array.from(allergenCodes);
    const allergenDiv = document.getElementById('recipeAllergens');
    if (codes.length === 0) {
      allergenDiv.innerHTML = '<div class="mute">Nessun allergene presente</div>';
    } else {
      allergenDiv.innerHTML = codes.map(c => {
        const allergen = ALLERGEN_LIST.find(x => x.code === c);
        return `<div class="allergen-tag">${allergen ? allergen.name : c}</div>`;
      }).join('');
    }

    const includedDiv = document.getElementById('includedBases');
    includedDiv.innerHTML = '';

    if (recipe.importedBases && recipe.importedBases.length > 0) {
      const baseHeader = document.createElement('h4');
      baseHeader.textContent = 'Preparazioni base incluse:';
      baseHeader.style.marginBottom = '10px';
      includedDiv.appendChild(baseHeader);

      (recipe.importedBases || []).forEach(bid => {
        const base = preparazioni.find(x => String(x.id) === String(bid));
        if (!base) return;

        const block = document.createElement('div');
        block.style.marginBottom = '15px';
        block.style.padding = '10px';
        block.style.backgroundColor = '#f0f7ff';
        block.style.borderRadius = '6px';
        block.style.borderLeft = '3px solid var(--blue-accent)';

        block.innerHTML = `<strong>${base.name}</strong>`;

        let baseTotalCost = 0;
        const ul = document.createElement('ul');
        ul.style.marginTop = '8px';
        ul.style.marginLeft = '15px';

        base.ingredients.forEach(ingLine => {
          const ingObj = ingredienti.find(i => String(i.id) === String(ingLine.id));
          const qtyAdj = (ingLine.qty || 0) * (forPortions / (recipe.portions || 1));
          const costLine = ingObj ? computeCostForIngredient(ingObj, qtyAdj, ingLine.unit) : 0;
          baseTotalCost += costLine;

          const li = document.createElement('li');
          li.style.marginBottom = '4px';
          li.innerHTML = `${ingObj ? ingObj.name : ingLine.id} — ${qtyAdj.toFixed(1)}${ingLine.unit || ''} — € ${costLine.toFixed(2)}`;
          ul.appendChild(li);
        });

        const totalLine = document.createElement('div');
        totalLine.style.marginTop = '8px';
        totalLine.style.paddingTop = '8px';
        totalLine.style.borderTop = '2px dashed var(--blue-accent)';
        totalLine.style.fontWeight = 'bold';
        totalLine.style.color = 'var(--blue-light)';
        totalLine.style.textAlign = 'right';
        totalLine.className = 'base-total-cost';
        totalLine.innerHTML = `Totale preparazione: <strong>€ ${baseTotalCost.toFixed(2)}</strong>`;

        block.appendChild(ul);
        block.appendChild(totalLine);
        includedDiv.appendChild(block);
      });
    }
  }

  const portInput = document.getElementById('recipePortions');
  renderIngredients(Number(portInput.value));

  portInput.addEventListener('input', () => renderIngredients(Number(portInput.value)));

  if (recipe.weightPerPortion) {
    const applyWeightBtn = document.getElementById('applyWeight');
    const desiredWeightInput = document.getElementById('desiredWeight');

    applyWeightBtn.addEventListener('click', () => {
      const desiredWeight = parseFloat(desiredWeightInput.value);
      if (!desiredWeight || desiredWeight <= 0) return alert('Inserisci un peso valido');
      const calculatedPortions = (desiredWeight / recipe.weightPerPortion) * recipe.portions;
      portInput.value = calculatedPortions.toFixed(2);
      renderIngredients(calculatedPortions);
    });

    desiredWeightInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') applyWeightBtn.click();
    });
  }

  document.getElementById('editRecipeBtn').addEventListener('click', () =>
    window.location.href = `modifica-ricetta.html?id=${encodeURIComponent(recipe.id)}`
  );
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.getElementById('preparationText').innerHTML = recipe.preparation || '';
}

/* ========================================================================
   EDIT RECIPE PAGE
   ======================================================================== */
async function initEditRecipePage() {
  await loadData();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const form = document.getElementById('recipeForm');
  const ingSelect = document.getElementById('ingredientSelect');
  const ingQty = document.getElementById('ingredientQty');
  const ingUnit = document.getElementById('ingredientUnit');
  const addIngBtn = document.getElementById('addIngredientBtn');
  const ingList = document.getElementById('ingredientsList');
  const baseSelect = document.getElementById('baseSelect');
  const importBaseBtn = document.getElementById('importBaseBtn');
  const importedBasesList = document.getElementById('importedBasesList');

  const sortedIngredients = [...ingredienti].sort((a, b) => a.name.localeCompare(b.name));
  ingSelect.innerHTML = '<option value="">Seleziona ingrediente...</option>';
  sortedIngredients.forEach(i => {
    const o = document.createElement('option');
    o.value = i.id;
    o.textContent = i.name;
    ingSelect.appendChild(o);
  });

  function populateBaseSelect() {
    if (!baseSelect) return;
    baseSelect.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Seleziona preparazione...';
    baseSelect.appendChild(def);

    const sortedPreparazioni = [...preparazioni].sort((a, b) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    );
    sortedPreparazioni.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name;
      baseSelect.appendChild(o);
    });
  }
  populateBaseSelect();

  function createIngredientEditor(item) {
    const ingObj = ingredienti.find(i => String(i.id) === String(item.id));
    const li = document.createElement('li');

    li.innerHTML = `
      <div class="ingredient-editor">
        <span class="ingredient-name">${ingObj ? ingObj.name : item.id}</span>
        <input type="number" value="${item.qty}" step="0.1" min="0" class="edit-qty" placeholder="Quantità" />
        <select class="edit-unit">
          <option value="g" ${item.unit === 'g' ? 'selected' : ''}>g</option>
          <option value="ml" ${item.unit === 'ml' ? 'selected' : ''}>ml</option>
          <option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>pcs</option>
          <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>kg</option>
          <option value="l" ${item.unit === 'l' ? 'selected' : ''}>l</option>
          <option value="min" ${item.unit === 'min' ? 'selected' : ''}>min</option>
          <option value="h" ${item.unit === 'h' ? 'selected' : ''}>h</option>
        </select>
        <div class="ingredient-actions">
          <button type="button" class="btn update-btn">Aggiorna</button>
          <button type="button" class="btn delete-btn">Elimina</button>
        </div>
      </div>
    `;

    const updateBtn = li.querySelector('.update-btn');
    const qtyInput = li.querySelector('.edit-qty');
    const unitSelect = li.querySelector('.edit-unit');

    updateBtn.addEventListener('click', () => {
      item.qty = Number(qtyInput.value) || 0;
      item.unit = unitSelect.value;
      const newLi = createIngredientEditor(item);
      li.replaceWith(newLi);
      sortIngredientsListAlphabetically();
    });

    li.querySelector('.delete-btn').addEventListener('click', () => {
      li.remove();
      sortIngredientsListAlphabetically();
    });

    return li;
  }

  function sortIngredientsListAlphabetically() {
    const items = Array.from(ingList.children);
    if (items.length === 0) return;
    items.sort((a, b) => {
      const nameA = a.querySelector('.ingredient-name').textContent.toLowerCase();
      const nameB = b.querySelector('.ingredient-name').textContent.toLowerCase();
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' });
    });
    items.forEach(item => ingList.appendChild(item));
  }

  function sortBasesListAlphabetically() {
    const items = Array.from(importedBasesList.children);
    if (items.length === 0) return;
    items.sort((a, b) => {
      const nameA = a.textContent.split('Rimuovi')[0].trim().toLowerCase();
      const nameB = b.textContent.split('Rimuovi')[0].trim().toLowerCase();
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' });
    });
    items.forEach(item => importedBasesList.appendChild(item));
  }

  function addIngredientToList(item) {
    const li = createIngredientEditor(item);
    ingList.appendChild(li);
    sortIngredientsListAlphabetically();
  }

  function addImportedBase(baseId) {
    if (!baseId) return;
    if (Array.from(importedBasesList.children).some(li => li.dataset.id === baseId)) return;
    const base = preparazioni.find(b => String(b.id) === String(baseId));
    if (!base) return;
    const li = document.createElement('li');
    li.dataset.id = base.id;
    li.textContent = base.name;
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Rimuovi';
    del.addEventListener('click', () => {
      li.remove();
      sortBasesListAlphabetically();
    });
    li.appendChild(del);
    importedBasesList.appendChild(li);
    sortBasesListAlphabetically();
  }

  let editing = null;
  if (id) {
    editing = ricette.find(r => String(r.id) === String(id));
    if (editing) {
      form.name.value = editing.name;
      form.portions.value = editing.portions || 1;
      form.weightPerPortion.value = editing.weightPerPortion || '';
      form.time.value = editing.time || '';
      form.difficulty.value = editing.difficulty || '';
      form.image.value = editing.image || '';
      form.preparation.value = editing.preparation || '';
      (editing.ingredients || []).forEach(it => addIngredientToList(it));
      (editing.importedBases || []).forEach(bid => addImportedBase(bid));
    }
  }

  ingSelect.addEventListener('change', () => {
    const ing = ingredienti.find(x => x.id === ingSelect.value);
    if (ing) {
      if (ing.unit === 'min' || ing.unit === 'h') ingUnit.value = 'min';
      else ingUnit.value = ing.unit || 'g';
    }
  });

  addIngBtn.addEventListener('click', () => {
    const idSel = ingSelect.value;
    const qtyVal = Number(ingQty.value) || 0;
    const unit = ingUnit.value || 'g';

    if (!idSel) return alert('Seleziona ingrediente');
    if (qtyVal <= 0) return alert('Inserisci una quantità valida');

    addIngredientToList({ id: idSel, qty: qtyVal, unit: unit });
    ingQty.value = '';
    ingSelect.value = '';
    ingUnit.value = 'g';
  });

  importBaseBtn.addEventListener('click', () => {
    const v = baseSelect.value;
    if (!v) return alert('Seleziona una preparazione');
    addImportedBase(v);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const ingredients = Array.from(ingList.querySelectorAll('li')).map(li => {
      const qtyInput = li.querySelector('.edit-qty');
      const unitSelect = li.querySelector('.edit-unit');
      const ingredientName = li.querySelector('.ingredient-name').textContent;
      const ing = ingredienti.find(i => i.name === ingredientName);
      return {
        id: ing ? ing.id : 'unknown',
        qty: Number(qtyInput.value) || 0,
        unit: unitSelect.value
      };
    });

    const r = {
      id: editing ? editing.id : `r${Date.now()}`,
      name: form.name.value,
      portions: Number(form.portions.value),
      weightPerPortion: form.weightPerPortion.value ? Number(form.weightPerPortion.value) : null,
      time: form.time.value,
      difficulty: form.difficulty.value,
      image: form.image.value,
      preparation: form.preparation.value,
      ingredients: ingredients,
      importedBases: Array.from(importedBasesList.querySelectorAll('li')).map(li => li.dataset.id)
    };

    const others = ricette.filter(x => String(x.id) !== String(r.id));
    others.push(r);

    const ok = await saveRicette(others);
    if (ok) {
      alert('Ricetta salvata online.');
    } else {
      alert('Salvataggio online fallito. Salvato localmente.');
    }
    window.location.href = `ricetta.html?id=${encodeURIComponent(r.id)}`;
  });
}

/* ========================================================================
   SETTINGS PAGE
   ======================================================================== */
async function initSettingsPage() {
  // Forza lettura da JSONBin per avere i dati freschi
  await loadData(true);

  document.getElementById('exportBtn').addEventListener('click', () => {
    const bi = new Blob([JSON.stringify(ingredienti, null, 2)], { type: 'application/json' });
    const ai = document.createElement('a');
    ai.href = URL.createObjectURL(bi);
    ai.download = 'ingredienti.json';
    ai.click();

    const br = new Blob([JSON.stringify(ricette, null, 2)], { type: 'application/json' });
    const ar = document.createElement('a');
    ar.href = URL.createObjectURL(br);
    ar.download = 'ricette.json';
    ar.click();

    const bp = new Blob([JSON.stringify(preparazioni, null, 2)], { type: 'application/json' });
    const ap = document.createElement('a');
    ap.href = URL.createObjectURL(bp);
    ap.download = 'preparazioni.json';
    ap.click();
  });

  document.getElementById('importFile').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const text = await f.text();
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json) && json.length && json[0].ingredients !== undefined && json[0].preparation !== undefined && json[0].name !== undefined && json[0].id && String(json[0].id).startsWith('pb')) {
        await savePreparazioni(json);
        alert('Preparazioni importate e salvate online.');
      } else if (Array.isArray(json) && json.length && json[0].price !== undefined && json[0].priceUnit !== undefined) {
        await saveIngredienti(json);
        alert('Ingredienti importati e salvati online.');
      } else {
        await saveRicette(json);
        alert('Ricette importate e salvate online.');
      }
    } catch (e) {
      alert('File non valido JSON');
    }
  });

  // Pulsante extra "Sincronizza ora da JSONBin" se presente
  const syncBtn = document.getElementById('syncBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      await loadData(true);
      alert('Dati sincronizzati da JSONBin!');
    });
  }
}

/* ========================================================================
   REGISTRAZIONE SERVICE WORKER (chiamata da ogni pagina)
   ======================================================================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service Worker non registrato:', err);
    });
  });
}
/* ========================================================================
   ORDINI / PLANNER
   ======================================================================== */

async function saveOrdini(arr) {
  try {
    await jsonbinWrite(BIN_ORDINI, arr);
    ordini = arr;
    localStorage.setItem(LS_ORD, JSON.stringify(arr));
    return true;
  } catch (e) {
    console.warn('Salvataggio ordini fallito, cache locale aggiornata', e);
    localStorage.setItem(LS_ORD, JSON.stringify(arr));
    return false;
  }
}

async function loadOrdini(forceRemote = false) {
  // cache locale prima
  if (!forceRemote) {
    try {
      const co = localStorage.getItem(LS_ORD);
      if (co) ordini = JSON.parse(co);
    } catch (e) { /* ignore */ }
  }
  // poi sync da JSONBin
  try {
    const arr = await jsonbinRead(BIN_ORDINI);
    if (Array.isArray(arr)) {
      ordini = arr;
      localStorage.setItem(LS_ORD, JSON.stringify(arr));
    }
  } catch (e) {
    console.warn('Lettura ordini da JSONBin fallita, uso cache locale', e);
  }
}

/* -------- PLANNER PAGE -------- */
async function initPlannerPage() {
  await loadOrdini();

  const search = document.getElementById('ordiniSearch');
  const containerFuturi = document.getElementById('ordiniFuturi');
  const containerPassati = document.getElementById('ordiniPassati');

  function formatData(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      const giorno = String(d.getDate()).padStart(2, '0');
      const mese = String(d.getMonth() + 1).padStart(2, '0');
      const anno = d.getFullYear();
      const ore = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${giorno}/${mese}/${anno} ${ore}:${min}`;
    } catch (e) {
      return iso;
    }
  }

  function statoBadge(stato) {
    const s = (stato || 'in attesa').toLowerCase();
    let color = '#f59e0b'; // giallo default
    if (s === 'confermato') color = '#10b981';
    if (s === 'fatto') color = '#02119e';
    if (s === 'annullato') color = '#ef4444';
    return `<span class="ordine-stato" style="background:${color};">${stato || 'in attesa'}</span>`;
  }

  function createOrdineCard(o) {
    const div = document.createElement('div');
    div.className = 'ordine-card';
    div.innerHTML = `
      <div class="ordine-data">${formatData(o.dataConsegna)}</div>
      <div class="ordine-cliente">${o.cliente || '—'}</div>
      <div class="ordine-dolce">${o.dolce || ''}</div>
      ${o.quantita ? `<div class="ordine-riga"><strong>Qtà:</strong> ${o.quantita}</div>` : ''}
      ${o.ritiroConsegna ? `<div class="ordine-riga"><strong>Ritiro/Consegna:</strong> ${o.ritiroConsegna}</div>` : ''}
      ${o.note ? `<div class="ordine-riga ordine-note"><strong>Note:</strong> ${o.note}</div>` : ''}
      <div class="ordine-footer">
        ${statoBadge(o.stato)}
        <div class="ordine-actions">
          <button class="btn btn-small" data-act="edit" data-id="${o.id}">Modifica</button>
          <button class="btn btn-small" data-act="del" data-id="${o.id}">Elimina</button>
        </div>
      </div>
    `;
    return div;
  }

  function render() {
    const q = (search.value || '').toLowerCase().trim();
    const now = new Date();

    const filtered = ordini.filter(o => {
      if (!q) return true;
      const blob = `${o.cliente || ''} ${o.dolce || ''} ${o.note || ''} ${o.quantita || ''} ${o.ritiroConsegna || ''}`.toLowerCase();
      return blob.includes(q);
    });

    const futuri = [];
    const passati = [];

    filtered.forEach(o => {
      const d = o.dataConsegna ? new Date(o.dataConsegna) : null;
      if (d && d >= now) futuri.push(o);
      else passati.push(o);
    });

    futuri.sort((a, b) => new Date(a.dataConsegna) - new Date(b.dataConsegna));
    passati.sort((a, b) => new Date(b.dataConsegna) - new Date(a.dataConsegna));

    containerFuturi.innerHTML = '';
    containerPassati.innerHTML = '';

    if (futuri.length === 0) {
      containerFuturi.innerHTML = '<p class="mute">Nessun ordine in programma.</p>';
    } else {
      futuri.forEach(o => containerFuturi.appendChild(createOrdineCard(o)));
    }

    if (passati.length === 0) {
      containerPassati.innerHTML = '<p class="mute">Nessun ordine passato.</p>';
    } else {
      passati.forEach(o => containerPassati.appendChild(createOrdineCard(o)));
    }

    // Handlers
    document.querySelectorAll('.ordine-card button').forEach(b => {
      b.addEventListener('click', async (ev) => {
        const id = ev.currentTarget.dataset.id;
        const act = ev.currentTarget.dataset.act;
        if (act === 'edit') {
          window.location.href = `modifica-ordine.html?id=${encodeURIComponent(id)}`;
        }
        if (act === 'del') {
          if (!confirm('Eliminare questo ordine?')) return;
          const others = ordini.filter(x => String(x.id) !== String(id));
          await saveOrdini(others);
          render();
        }
      });
    });
  }

  render();
  search.addEventListener('input', render);
}

/* -------- EDIT ORDINE PAGE -------- */
async function initEditOrdinePage() {
  await loadOrdini();

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const form = document.getElementById('ordineForm');

  let editing = null;
  if (id) {
    editing = ordini.find(o => String(o.id) === String(id));
    if (editing) {
      form.cliente.value = editing.cliente || '';
      form.dataConsegna.value = editing.dataConsegna || '';
      form.dolce.value = editing.dolce || '';
      form.quantita.value = editing.quantita || '';
      form.note.value = editing.note || '';
      form.ritiroConsegna.value = editing.ritiroConsegna || '';
      form.stato.value = editing.stato || 'in attesa';
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const obj = {
      id: editing ? editing.id : `o${Date.now()}`,
      cliente: form.cliente.value,
      dataConsegna: form.dataConsegna.value,
      dolce: form.dolce.value,
      quantita: form.quantita.value,
      note: form.note.value,
      ritiroConsegna: form.ritiroConsegna.value,
      stato: form.stato.value || 'in attesa'
    };

    const others = ordini.filter(x => String(x.id) !== String(obj.id));
    others.push(obj);

    const ok = await saveOrdini(others);
    if (ok) {
      alert('Ordine salvato online.');
    } else {
      alert('Salvataggio online fallito. Salvato localmente.');
    }
    window.location.href = 'planner.html';
  });
}

/* FINE FILE */