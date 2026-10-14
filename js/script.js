/* ========================================================================
   SCRIPT.JS - Ricette PWA
   Gestione ricette, preparazioni base, ingredienti, ordini (planner)
   Dati su JSONBin, cache locale per offline, temi, export PDF
   ======================================================================== */

/* ---------------- CONFIGURAZIONE JSONBIN ---------------- */
const JSONBIN_KEY = '$2a$10$O9DeoNpqBSYwuBJUsebAdON/SGrC8KTJ/btm8DGG/LxCTplTcq7LO';
const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const LS_THEME = 'ricette_tema';
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

/* ========================================================================
   MIGRAZIONE DATI
   Converte il vecchio formato `importedBases: ["pb123"]` in `[{id, porzioni}]`
   usando le porzioni base della preparazione come default.
   ======================================================================== */

function migrateImportedBases(ricetteArr, preparazioniArr) {
  if (!Array.isArray(ricetteArr)) return ricetteArr;

  ricetteArr.forEach(r => {
    if (!Array.isArray(r.importedBases)) {
      r.importedBases = [];
      return;
    }
    r.importedBases = r.importedBases.map(item => {
      // Già nel formato nuovo
      if (typeof item === 'object' && item !== null && item.id) {
        return {
          id: String(item.id),
          porzioni: Number(item.porzioni) || 1
        };
      }
      // Vecchio formato: stringa
      const base = preparazioniArr.find(p => String(p.id) === String(item));
      return {
        id: String(item),
        porzioni: base ? (Number(base.porzioni) || 1) : 1
      };
    });
  });

  return ricetteArr;
}

/* ========================================================================
   SALVATAGGI CON FALLBACK LOCALE
   ======================================================================== */

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

/* ========================================================================
   LOAD DATA (con fallback localStorage + migrazione)
   ======================================================================== */

async function loadData(forceRemote = false) {
  if (!forceRemote) {
    try {
      const ci = localStorage.getItem(LS_ING);
      const cr = localStorage.getItem(LS_RIC);
      const cp = localStorage.getItem(LS_PREP);
      if (ci) ingredienti = JSON.parse(ci);
      if (cr) ricette = JSON.parse(cr);
      if (cp) preparazioni = JSON.parse(cp);
      // Migra la cache locale
      ricette = migrateImportedBases(ricette, preparazioni);
    } catch (e) { /* ignore */ }
  }

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
    if (Array.isArray(prep)) {
      preparazioni = prep;
      localStorage.setItem(LS_PREP, JSON.stringify(prep));
    }
    if (Array.isArray(ric)) {
      // Migra il formato importedBases
      ricette = migrateImportedBases(ric, preparazioni);
      localStorage.setItem(LS_RIC, JSON.stringify(ricette));
    }
  } catch (e) {
    console.warn('Lettura JSONBin fallita, uso cache locale', e);
  }
}

/* ========================================================================
   HELPERS: costi e macro di un ingrediente
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
   HELPERS: costo/macro/peso/allergeni di una preparazione base
   Calcolati alle porzioni base della preparazione.
   ======================================================================== */

function computePreparazioneBaseStats(base) {
  const stats = {
    costo: 0,
    macro: { kcal: 0, prot: 0, carb: 0, fat: 0 },
    allergeni: new Set(),
    pesoStimato: 0
  };

  if (!base || !Array.isArray(base.ingredients)) return stats;

  base.ingredients.forEach(it => {
    const ing = ingredienti.find(x => String(x.id) === String(it.id));
    if (!ing) return;

    const qty = Number(it.qty) || 0;
    const unit = it.unit || 'g';

    stats.costo += computeCostForIngredient(ing, qty, unit);

    const m = computeMacroForIngredient(ing, qty, unit);
    stats.macro.kcal += m.kcal;
    stats.macro.prot += m.prot;
    stats.macro.carb += m.carb;
    stats.macro.fat += m.fat;

    (ing.allergeni || []).forEach(a => stats.allergeni.add(a));

    // Peso stimato
    if (unit === 'g' || unit === 'gr' || unit === 'grammi') stats.pesoStimato += qty;
    else if (unit === 'pcs' && ing.weightPerPiece) stats.pesoStimato += qty * ing.weightPerPiece;
    else if (unit === 'ml') stats.pesoStimato += qty;
  });

  return stats;
}

/* ========================================================================
   INDEX PAGE (ricette + preparazioni base)
   Card uniformi con pulsanti Modifica / Elimina
   ======================================================================== */

async function initIndexPage() {
  await loadData();
  const recipesList = document.getElementById('recipesList');
  const basesList = document.getElementById('basesList');
  const search = document.getElementById('searchInput');

  function createCard(item, tipo) {
    // tipo: 'ricetta' | 'preparazione'
    const li = document.createElement('li');
    li.className = 'card-item';

    const isRicetta = tipo === 'ricetta';

    li.innerHTML = `
      <span class="card-title">${item.name}</span>
      <div class="card-actions">
        <button class="btn btn-small card-btn-edit" data-id="${item.id}">Modifica</button>
        <button class="btn btn-small card-btn-del" data-id="${item.id}">Elimina</button>
      </div>
    `;

    // Click sulla card (non sui pulsanti) → vista lettura
    li.addEventListener('click', (ev) => {
      // Se il click è partito da un pulsante, ignora
      if (ev.target.closest('.card-actions')) return;
      if (isRicetta) {
        window.location.href = `ricetta.html?id=${encodeURIComponent(item.id)}`;
      } else {
        window.location.href = `preparazione-base.html?id=${encodeURIComponent(item.id)}`;
      }
    });

    // Pulsante Modifica
    li.querySelector('.card-btn-edit').addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (isRicetta) {
        window.location.href = `modifica-ricetta.html?id=${encodeURIComponent(item.id)}`;
      } else {
        window.location.href = `modifica-preparazione-base.html?id=${encodeURIComponent(item.id)}`;
      }
    });

    // Pulsante Elimina
    li.querySelector('.card-btn-del').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const msg = isRicetta ? 'Eliminare questa ricetta?' : 'Eliminare questa preparazione?';
      if (!confirm(msg)) return;

      if (isRicetta) {
        const others = ricette.filter(x => String(x.id) !== String(item.id));
        await saveRicette(others);
      } else {
        const others = preparazioni.filter(x => String(x.id) !== String(item.id));
        await savePreparazioni(others);
      }
      render();
    });

    return li;
  }

  function render() {
    recipesList.innerHTML = '';
    basesList.innerHTML = '';

    const sortedRicette = [...ricette].sort((a, b) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    );
    const sortedPreparazioni = [...preparazioni].sort((a, b) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    );

    sortedRicette.forEach(r => recipesList.appendChild(createCard(r, 'ricetta')));
    sortedPreparazioni.forEach(p => basesList.appendChild(createCard(p, 'preparazione')));
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
   PREPARATIONS PAGE (lista preparazioni base)
   Card uniformi con pulsanti Modifica / Elimina
   ======================================================================== */

async function initPreparationsPage() {
  await loadData();
  const list = document.getElementById('prepsList');
  const search = document.getElementById('baseSearch');

  function createCard(p) {
    const li = document.createElement('li');
    li.className = 'card-item';

    li.innerHTML = `
      <span class="card-title">${p.name}</span>
      <div class="card-actions">
        <button class="btn btn-small card-btn-edit" data-id="${p.id}">Modifica</button>
        <button class="btn btn-small card-btn-del" data-id="${p.id}">Elimina</button>
      </div>
    `;

    // Click sulla card → vista lettura
    li.addEventListener('click', (ev) => {
      if (ev.target.closest('.card-actions')) return;
      window.location.href = `preparazione-base.html?id=${encodeURIComponent(p.id)}`;
    });

    // Modifica
    li.querySelector('.card-btn-edit').addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.location.href = `modifica-preparazione-base.html?id=${encodeURIComponent(p.id)}`;
    });

    // Elimina
    li.querySelector('.card-btn-del').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('Eliminare questa preparazione?')) return;
      const others = preparazioni.filter(x => String(x.id) !== String(p.id));
      await savePreparazioni(others);
      render();
    });

    return li;
  }

  function render() {
    list.innerHTML = '';
    const sortedPreparazioni = [...preparazioni].sort((a, b) =>
      a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
    );
    sortedPreparazioni.forEach(p => list.appendChild(createCard(p)));
  }

  render();

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase();
    Array.from(list.children).forEach(li => {
      li.style.display = li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

/* ========================================================================
   PREPARAZIONE BASE PAGE (vista lettura, come ricetta.html)
   ======================================================================== */

async function initPreparazioneBasePage() {
  await loadData();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const base = preparazioni.find(p => String(p.id) === String(id));

  if (!base) {
    document.getElementById('baseTitle').textContent = 'Preparazione non trovata';
    return;
  }

  document.getElementById('baseTitle').textContent = base.name;
  document.getElementById('basePortionsBase').textContent = base.porzioni || 1;

  const stats = computePreparazioneBaseStats(base);
  const porzioni = Number(base.porzioni) || 1;

  // Tabella ingredienti
  const tbody = document.querySelector('#baseIngredientsTable tbody');
  tbody.innerHTML = '';

  if (!Array.isArray(base.ingredients) || base.ingredients.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="8" class="mute">Nessun ingrediente</td>`;
    tbody.appendChild(tr);
  } else {
    // Ordina alfabeticamente
    const sorted = [...base.ingredients].sort((a, b) => {
      const ingA = ingredienti.find(i => String(i.id) === String(a.id));
      const ingB = ingredienti.find(i => String(i.id) === String(b.id));
      const nA = ingA ? ingA.name.toLowerCase() : '';
      const nB = ingB ? ingB.name.toLowerCase() : '';
      return nA.localeCompare(nB, 'it', { sensitivity: 'base' });
    });

    sorted.forEach(it => {
      const ing = ingredienti.find(x => String(x.id) === String(it.id));
      const qty = Number(it.qty) || 0;
      const unit = it.unit || 'g';
      const costo = ing ? computeCostForIngredient(ing, qty, unit) : 0;
      const macro = ing ? computeMacroForIngredient(ing, qty, unit) : { kcal:0, prot:0, carb:0, fat:0 };

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${ing ? ing.name : it.id}</strong></td>
        <td>${qty.toFixed(1)}</td>
        <td>${unit}</td>
        <td><strong>€ ${costo.toFixed(2)}</strong></td>
        <td><strong>${macro.kcal.toFixed(1)}</strong></td>
        <td>${macro.fat.toFixed(1)}g</td>
        <td>${macro.carb.toFixed(1)}g</td>
        <td>${macro.prot.toFixed(1)}g</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Totali tabella
  document.getElementById('baseTotalCost').textContent = `€ ${stats.costo.toFixed(2)}`;
  document.getElementById('baseTotalKcal').textContent = stats.macro.kcal.toFixed(1);
  document.getElementById('baseTotalFat').textContent = `${stats.macro.fat.toFixed(1)}g`;
  document.getElementById('baseTotalCarb').textContent = `${stats.macro.carb.toFixed(1)}g`;
  document.getElementById('baseTotalProt').textContent = `${stats.macro.prot.toFixed(1)}g`;

  // Box costi
  const costoPerPorzione = stats.costo / porzioni;
  document.getElementById('baseTotalCostBox').textContent = `€ ${stats.costo.toFixed(2)}`;
  document.getElementById('basePortionCost').textContent = `€ ${costoPerPorzione.toFixed(2)}`;

  // Box macro
  document.getElementById('baseKcalBox').textContent = `${Math.round(stats.macro.kcal)} kcal`;
  document.getElementById('baseProtBox').textContent = `${Math.round(stats.macro.prot)}g`;
  document.getElementById('baseCarbBox').textContent = `${Math.round(stats.macro.carb)}g`;
  document.getElementById('baseFatBox').textContent = `${Math.round(stats.macro.fat)}g`;

  // Peso e costi/macro per 100g se peso/porzione definito
  const pesoPerPorzione = Number(base.pesoPerPorzione) || 0;
  if (pesoPerPorzione > 0) {
    const pesoAtteso = porzioni * pesoPerPorzione;
    const costoPer100g = (stats.costo / pesoAtteso) * 100;
    const kcalPer100g = (stats.macro.kcal / pesoAtteso) * 100;

    document.getElementById('baseCostPer100g').style.display = 'flex';
    document.getElementById('baseCostPer100gValue').textContent = `€ ${costoPer100g.toFixed(2)}`;

    document.getElementById('baseMacroPer100g').style.display = 'block';
    document.getElementById('baseKcalPer100g').textContent = `${Math.round(kcalPer100g)} kcal`;

    document.getElementById('baseTotalWeightBox').style.display = 'block';
    document.getElementById('baseTotalWeightValue').textContent = `${Math.round(stats.pesoStimato)} g`;
  }

  // Allergeni
  const allergenDiv = document.getElementById('baseAllergens');
  const codes = Array.from(stats.allergeni);
  if (codes.length === 0) {
    allergenDiv.innerHTML = '<div class="mute">Nessun allergene presente</div>';
  } else {
    allergenDiv.innerHTML = codes.map(c => {
      const allergen = ALLERGEN_LIST.find(x => x.code === c);
      return `<div class="allergen-tag">${allergen ? allergen.name : c}</div>`;
    }).join('');
  }

  // Procedimento
  document.getElementById('basePreparationText').innerHTML = base.preparation || '';

  // Bottoni
  document.getElementById('editBaseBtn').addEventListener('click', () => {
    window.location.href = `modifica-preparazione-base.html?id=${encodeURIComponent(base.id)}`;
  });
  document.getElementById('printBaseBtn').addEventListener('click', () => window.print());
}

/* ========================================================================
   EDIT PREPARATION PAGE (editor completo: porzioni, peso, ingredienti, macro, allergeni)
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

  // Popola select ingredienti
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

  function refreshTotali() {
    const items = Array.from(list.querySelectorAll('li'));
    const tempBase = {
      ingredients: items.map(li => ({
        id: li.dataset.id,
        qty: Number(li.dataset.qty) || 0,
        unit: li.dataset.unit || 'g'
      }))
    };
    const stats = computePreparazioneBaseStats(tempBase);
    if (items.length > 0) {
      document.getElementById('prepTotalCost').style.display = 'block';
      document.getElementById('prepTotalCostValue').textContent = `€ ${stats.costo.toFixed(2)}`;
    } else {
      document.getElementById('prepTotalCost').style.display = 'none';
    }
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
    del.type = 'button';
    del.className = 'btn';
    del.textContent = 'Elimina';
    del.addEventListener('click', () => {
      li.remove();
      refreshTotali();
      sortIngredientsList(list);
    });

    costDiv.appendChild(del);
    container.appendChild(textDiv);
    container.appendChild(costDiv);
    li.appendChild(container);
    list.appendChild(li);

    refreshTotali();
    sortIngredientsList(list);
  }

  function sortIngredientsList(listElement) {
    const items = Array.from(listElement.children);
    items.sort((a, b) => a.textContent.toLowerCase().localeCompare(b.textContent.toLowerCase(), 'it', { sensitivity: 'base' }));
    items.forEach(item => listElement.appendChild(item));
  }

  // Carica dati esistenti se in modifica
  if (id) {
    const editing = preparazioni.find(p => String(p.id) === String(id));
    if (editing) {
      form.name.value = editing.name || '';
      form.porzioni.value = editing.porzioni || 1;
      form.pesoPerPorzione.value = editing.pesoPerPorzione || '';
      form.preparation.value = editing.preparation || '';
      (editing.ingredients || []).forEach(it => addLine(it));
      refreshTotali();
    }
  }

  addBtn.addEventListener('click', () => {
    if (!sel.value) return alert('Seleziona ingrediente');
    const it = { id: sel.value, qty: Number(qty.value) || 0, unit: unitSel.value || 'g' };
    addLine(it);
    qty.value = '';
    sel.value = '';
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const p = {
      id: id || `pb${Date.now()}`,
      name: form.name.value,
      porzioni: Number(form.porzioni.value) || 1,
      pesoPerPorzione: form.pesoPerPorzione.value ? Number(form.pesoPerPorzione.value) : null,
      preparation: form.preparation.value,
      ingredients: Array.from(list.querySelectorAll('li')).map(li => ({
        id: li.dataset.id,
        qty: Number(li.dataset.qty),
        unit: li.dataset.unit
      }))
    };
    const others = preparazioni.filter(x => String(x.id) !== String(p.id));
    others.push(p);
    const ok = await savePreparazioni(others);
    if (!ok) alert('Salvataggio online fallito. Salvato localmente.');
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
      tr.dataset.id = i.id;
      tr.innerHTML = `
        <td><strong>${i.name}</strong></td>
        <td>€ ${Number(i.price || 0).toFixed(2)}<br><small class="mute">${i.priceUnit || 'kg'}</small></td>
        <td>${i.unit || ''}</td>
        <td>${allergenHtml || '<span class="mute">nessuno</span>'}</td>
        <td><small>${macroHtml}</small></td>
        <td>
          <button data-id="${i.id}" class="btn btn-small duplicateIng">Duplica</button>
          <button data-id="${i.id}" class="btn btn-small deleteIng">Elimina</button>
        </td>
      `;

      // Click sulla riga (tranne pulsanti) → modifica
      tr.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        window.location.href = `modifica-ingrediente.html?id=${encodeURIComponent(i.id)}`;
      });

      tbody.appendChild(tr);
    });

    // Pulsante Duplica
    tbody.querySelectorAll('.duplicateIng').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
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

    // Pulsante Elimina
    tbody.querySelectorAll('.deleteIng').forEach(b => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const ing = ingredienti.find(i => String(i.id) === String(id));
        if (!ing) return;

        if (!confirm(`Eliminare l'ingrediente "${ing.name}"?`)) return;

        const others = ingredienti.filter(x => String(x.id) !== String(id));
        const ok = await saveIngredienti(others);
        if (ok) {
          alert('Ingrediente eliminato.');
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
    if (!ok) alert('Salvataggio online fallito. Salvato localmente.');
    window.location.href = 'ingredienti.html';
  });
}

/* ========================================================================
   RECIPE PAGE (vista lettura)
   Considera preparazioni base importate con porzioni selezionate
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

  /* Raccoglie ingredienti: quelli della ricetta + quelli delle prep base importate,
     scalati in base alle porzioni importate / porzioni base della prep. */
  function gatherAllIngredients(forPortions) {
    const result = [];

    // Ingredienti diretti
    (recipe.ingredients || []).forEach(it => {
      result.push({ ...it, source: 'recipe', parentBase: null, parentScale: 1 });
    });

    // Prep base importate
    (recipe.importedBases || []).forEach(ib => {
      const baseId = ib.id;
      const basePorzioniImportate = Number(ib.porzioni) || 1;
      const base = preparazioni.find(p => String(p.id) === String(baseId));
      if (!base) return;

      const basePorzioniOrig = Number(base.porzioni) || 1;
      const scale = basePorzioniImportate / basePorzioniOrig;

      (base.ingredients || []).forEach(it => {
        result.push({
          id: it.id,
          qty: (Number(it.qty) || 0) * scale,
          unit: it.unit || 'g',
          source: 'base',
          parentBase: baseId,
          parentScale: scale
        });
      });
    });

    // Scala per porzioni ricetta
    const factor = forPortions / (recipe.portions || 1);
    return result.map(it => ({
      id: it.id,
      qty: (it.qty || 0) * factor,
      unit: it.unit || 'g',
      source: it.source,
      parentBase: it.parentBase,
      parentScale: it.parentScale
    }));
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
        else if (unit === 'ml') totalRecipeWeight += qtyAdjusted;
      }

      totalCost += cost;

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
        <td>${unit}</td>
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

    // Allergeni
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

    // Preparazioni base incluse (con porzioni importate)
    const includedDiv = document.getElementById('includedBases');
    includedDiv.innerHTML = '';

    if (recipe.importedBases && recipe.importedBases.length > 0) {
      const baseHeader = document.createElement('h4');
      baseHeader.textContent = 'Preparazioni base incluse:';
      baseHeader.style.marginBottom = '10px';
      includedDiv.appendChild(baseHeader);

      recipe.importedBases.forEach(ib => {
        const base = preparazioni.find(x => String(x.id) === String(ib.id));
        if (!base) return;

        const basePorzioniImportate = Number(ib.porzioni) || 1;
        const basePorzioniOrig = Number(base.porzioni) || 1;
        const scale = basePorzioniImportate / basePorzioniOrig;

        const block = document.createElement('div');
        block.style.marginBottom = '15px';
        block.style.padding = '10px';
        block.style.backgroundColor = '#f0f7ff';
        block.style.borderRadius = '6px';
        block.style.borderLeft = '3px solid var(--blue-accent)';

        block.innerHTML = `<strong>${base.name}</strong>
          <small class="mute"> — ${basePorzioniImportate} ${basePorzioniImportate === 1 ? 'porzione' : 'porzioni'} importate</small>`;

        let baseTotalCost = 0;
        const ul = document.createElement('ul');
        ul.style.marginTop = '8px';
        ul.style.marginLeft = '15px';

        base.ingredients.forEach(ingLine => {
          const ingObj = ingredienti.find(i => String(i.id) === String(ingLine.id));
          const qtyAdj = (Number(ingLine.qty) || 0) * scale * (forPortions / (recipe.portions || 1));
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
   EDIT RECIPE PAGE (con selezione porzioni per prep base importate)
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
  const basePorzioniInput = document.getElementById('basePorzioniInput');
  const importBaseBtn = document.getElementById('importBaseBtn');
  const importedBasesList = document.getElementById('importedBasesList');

  // Popola select ingredienti
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

  // Quando si seleziona una prep, il campo porzioni si aggiorna col valore di default
  baseSelect.addEventListener('change', () => {
    const baseId = baseSelect.value;
    const base = preparazioni.find(p => String(p.id) === String(baseId));
    if (base) {
      basePorzioniInput.value = base.porzioni || 1;
    } else {
      basePorzioniInput.value = '';
    }
  });

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
      const nameA = a.textContent.split('porzioni')[0].trim().toLowerCase();
      const nameB = b.textContent.split('porzioni')[0].trim().toLowerCase();
      return nameA.localeCompare(nameB, 'it', { sensitivity: 'base' });
    });
    items.forEach(item => importedBasesList.appendChild(item));
  }

  function addIngredientToList(item) {
    const li = createIngredientEditor(item);
    ingList.appendChild(li);
    sortIngredientsListAlphabetically();
  }

  /* Aggiunge una prep base importata con porzioni specifiche */
  function addImportedBase(baseId, porzioni) {
    if (!baseId) return;
    if (Array.from(importedBasesList.children).some(li => li.dataset.id === baseId)) return;
    const base = preparazioni.find(b => String(b.id) === String(baseId));
    if (!base) return;

    const porz = Number(porzioni) || Number(base.porzioni) || 1;

    const li = document.createElement('li');
    li.dataset.id = base.id;
    li.dataset.porzioni = porz;

    const label = document.createElement('span');
    label.innerHTML = `<strong>${base.name}</strong> — ${porz} ${porz === 1 ? 'porzione' : 'porzioni'}`;

    // Input per modificare le porzioni
    const porzInput = document.createElement('input');
    porzInput.type = 'number';
    porzInput.min = '0.1';
    porzInput.step = '0.1';
    porzInput.value = porz;
    porzInput.style.width = '80px';
    porzInput.style.marginLeft = '10px';
    porzInput.style.marginRight = '10px';
    porzInput.addEventListener('change', () => {
      const v = Number(porzInput.value) || 1;
      li.dataset.porzioni = v;
      label.innerHTML = `<strong>${base.name}</strong> — ${v} ${v === 1 ? 'porzione' : 'porzioni'}`;
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn';
    del.textContent = 'Rimuovi';
    del.addEventListener('click', () => {
      li.remove();
      sortBasesListAlphabetically();
    });

    li.appendChild(label);
    li.appendChild(porzInput);
    li.appendChild(del);
    importedBasesList.appendChild(li);
    sortBasesListAlphabetically();
  }

  // Carica dati esistenti se in modifica
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
      (editing.importedBases || []).forEach(ib => addImportedBase(ib.id, ib.porzioni));
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
    const porz = Number(basePorzioniInput.value) || null;
    addImportedBase(v, porz);
    baseSelect.value = '';
    basePorzioniInput.value = '';
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

    const importedBases = Array.from(importedBasesList.querySelectorAll('li')).map(li => ({
      id: li.dataset.id,
      porzioni: Number(li.dataset.porzioni) || 1
    }));

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
      importedBases: importedBases
    };

    const others = ricette.filter(x => String(x.id) !== String(r.id));
    others.push(r);

    const ok = await saveRicette(others);
    if (!ok) alert('Salvataggio online fallito. Salvato localmente.');
    window.location.href = `ricetta.html?id=${encodeURIComponent(r.id)}`;
  });
}

/* ========================================================================
   REGISTRAZIONE SERVICE WORKER
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
  if (!forceRemote) {
    try {
      const co = localStorage.getItem(LS_ORD);
      if (co) ordini = JSON.parse(co);
    } catch (e) { /* ignore */ }
  }
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
    let color = '#f59e0b';
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
    if (!ok) alert('Salvataggio online fallito. Salvato localmente.');
    window.location.href = 'planner.html';
  });
}

/* ========================================================================
   TEMA (chiaro/scuro/default)
   ======================================================================== */

function applyTheme(theme) {
  document.body.classList.remove('theme-dark', 'theme-white');
  if (theme === 'dark') document.body.classList.add('theme-dark');
  else if (theme === 'white') document.body.classList.add('theme-white');
}

function initTheme() {
  const saved = localStorage.getItem(LS_THEME) || 'default';
  applyTheme(saved);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

function setTheme(theme) {
  localStorage.setItem(LS_THEME, theme);
  applyTheme(theme);
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === theme);
  });
}

/* ========================================================================
   IMPOSTAZIONI - temi + export PDF + JSON
   ======================================================================== */

async function initSettingsPage() {
  await loadData(true);

  /* ---- TEMA ---- */
  const currentTheme = localStorage.getItem(LS_THEME) || 'default';
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === currentTheme);
    c.addEventListener('click', () => setTheme(c.dataset.theme));
  });

  /* ---- EXPORT JSON ---- */
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

  /* ---- IMPORT JSON ---- */
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
        // Migra le ricette importate
        const migrated = migrateImportedBases(json, preparazioni);
        await saveRicette(migrated);
        alert('Ricette importate e salvate online.');
      }
    } catch (e) {
      alert('File non valido JSON');
    }
  });

  /* ---- SYNC ---- */
  const syncBtn = document.getElementById('syncBtn');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      await loadData(true);
      await loadOrdini(true);
      alert('Dati sincronizzati da JSONBin!');
    });
  }

  /* ---- EXPORT PDF ---- */
  const modal = document.getElementById('pdfModal');
  const select = document.getElementById('pdfRicettaSelect');

  select.innerHTML = '';
  [...ricette]
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }))
    .forEach(r => {
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = r.name;
      select.appendChild(o);
    });

  document.getElementById('exportPdfBtn').addEventListener('click', () => {
    modal.style.display = 'flex';
  });

  document.getElementById('pdfCancelBtn').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  document.getElementById('pdfConfirmBtn').addEventListener('click', async () => {
    const chkIng = document.getElementById('pdfChkIngredienti').checked;
    const chkAll = document.getElementById('pdfChkAllergeni').checked;
    const selectedOptions = Array.from(select.selectedOptions).map(o => o.value);
    const ricettaIds = selectedOptions.filter(v => v !== '');

    if (!chkIng && !chkAll) {
      alert('Seleziona almeno una cosa da esportare (ingredienti o allergeni).');
      return;
    }
    if (ricettaIds.length === 0) {
      alert('Seleziona almeno una ricetta.');
      return;
    }

    modal.style.display = 'none';
    await generaPdfRicette(ricettaIds, chkIng, chkAll);
  });
}

/* ========================================================================
   GENERAZIONE PDF (multipla)
   ======================================================================== */

function loadJsPDF() {
  return new Promise((resolve, reject) => {
    if (window.jspdf && window.jspdf.jsPDF) return resolve(window.jspdf.jsPDF);
    const s = document.createElement('script');
    s.src = JSPDF_CDN;
    s.onload = () => resolve(window.jspdf.jsPDF);
    s.onerror = () => reject(new Error('Impossibile caricare jsPDF'));
    document.head.appendChild(s);
  });
}

async function generaPdfRicette(ricettaIds, includiIngredienti, includiAllergeni) {
  if (!Array.isArray(ricettaIds) || ricettaIds.length === 0) {
    alert('Seleziona almeno una ricetta.');
    return;
  }

  const ricetteSelezionate = ricettaIds
    .map(id => ricette.find(r => String(r.id) === String(id)))
    .filter(Boolean);

  if (ricetteSelezionate.length === 0) {
    alert('Ricette non trovate.');
    return;
  }

  let JsPDF;
  try {
    JsPDF = await loadJsPDF();
  } catch (e) {
    alert('Errore nel caricamento della libreria PDF. Controlla la connessione.');
    return;
  }

  const ingredientiUnici = [];
  const aggiunti = new Set();

  function aggiungiIngrediente(id) {
    if (aggiunti.has(id)) return;
    aggiunti.add(id);
    const ing = ingredienti.find(x => String(x.id) === String(id));
    if (ing) ingredientiUnici.push(ing);
  }

  ricetteSelezionate.forEach(ricetta => {
    (ricetta.ingredients || []).forEach(it => aggiungiIngrediente(it.id));
    (ricetta.importedBases || []).forEach(ib => {
      const base = preparazioni.find(p => String(p.id) === String(ib.id));
      if (!base) return;
      (base.ingredients || []).forEach(it => aggiungiIngrediente(it.id));
    });
  });

  ingredientiUnici.sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));

  const allergeniSet = new Set();
  ingredientiUnici.forEach(ing => {
    (ing.allergeni || []).forEach(code => allergeniSet.add(code));
  });
  const allergeniArr = Array.from(allergeniSet).sort();

  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const MARGINE = 18;
  let y = MARGINE;
  const larghezzaPagina = doc.internal.pageSize.getWidth();
  const altezzaPagina = doc.internal.pageSize.getHeight();

  function nuovaPaginaSeNecessario(px = 8) {
    if (y + px > altezzaPagina - MARGINE) {
      doc.addPage();
      y = MARGINE;
    }
  }

  let titolo = 'Riepilogo ricette';
  if (ricetteSelezionate.length === 1) titolo = ricetteSelezionate[0].name;
  else if (ricetteSelezionate.length <= 3) titolo = ricetteSelezionate.map(r => r.name).join(' + ');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(2, 17, 158);
  doc.text(titolo, MARGINE, y);
  y += 10;

  doc.setDrawColor(2, 17, 158);
  doc.setLineWidth(0.6);
  doc.line(MARGINE, y, larghezzaPagina - MARGINE, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, MARGINE, y);
  y += 6;

  if (ricetteSelezionate.length > 1) {
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('Ricette incluse: ' + ricetteSelezionate.map(r => r.name).join(', '), MARGINE, y);
    y += 6;
  }
  y += 4;

  if (includiIngredienti) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text('INGREDIENTI', MARGINE, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);

    if (ingredientiUnici.length === 0) {
      doc.text('(nessun ingrediente)', MARGINE, y);
      y += 8;
    } else {
      ingredientiUnici.forEach(ing => {
        nuovaPaginaSeNecessario(6);
        doc.text(`• ${ing.name}`, MARGINE, y);
        y += 6;
      });
    }
    y += 6;
  }

  if (includiAllergeni) {
    nuovaPaginaSeNecessario(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(40, 40, 40);
    doc.text('ALLERGENI', MARGINE, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);

    if (allergeniArr.length === 0) {
      doc.text('(nessun allergene presente)', MARGINE, y);
      y += 8;
    } else {
      allergeniArr.forEach(code => {
        nuovaPaginaSelezionaSeNecessario && null;
        nuovaPaginaSeNecessario(6);
        const allergen = ALLERGEN_LIST.find(x => x.code === code);
        const nome = allergen ? allergen.name : code;
        doc.text(`• ${nome} (${code})`, MARGINE, y);
        y += 6;
      });
    }
  }

  let nomeFile = 'ricetta';
  if (ricetteSelezionate.length === 1) {
    nomeFile = `ricetta-${ricetteSelezionate[0].name.replace(/[^a-z0-9]/gi, '_')}.pdf`;
  } else {
    nomeFile = `ricette-${ricetteSelezionate.length}.pdf`;
  }
  doc.save(nomeFile);
}

/* FINE FILE */