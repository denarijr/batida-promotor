// URL DA API DO GOOGLE APPS SCRIPT
const API_URL = "https://script.google.com/macros/s/AKfycby6v5BhdopQZkVY1Rpxm-J9qOnD7N8ud14zhGwjsdeZFJ9PD76ANtfpPSC7Sp7Q0AzpGA/exec";

// ESTADO GLOBAL DA APLICAÇÃO
let db;
let lojaAutenticada = JSON.parse(localStorage.getItem("loja_autenticada") || "null");
let promotorSelecionado = null;

// ELEMENTOS DOM - LOGIN E TERMINAL
const cardLoginLoja = document.getElementById("cardLoginLoja");
const cardRegistroPonto = document.getElementById("cardRegistroPonto");
const painelLojaConectada = document.getElementById("painelLojaConectada");
const labelNomeLoja = document.getElementById("labelNomeLoja");
const formLoginLoja = document.getElementById("formLoginLoja");
const inputUsuarioLoja = document.getElementById("inputUsuarioLoja");
const inputSenhaLoja = document.getElementById("inputSenhaLoja");
const erroLoginLoja = document.getElementById("erroLoginLoja");
const btnDesconectarLoja = document.getElementById("btnDesconectarLoja");

// ELEMENTOS DOM - REDEFINIÇÃO DE SENHA
const modalRedefinirSenha = document.getElementById("modalRedefinirSenha");
const formRedefinirSenha = document.getElementById("formRedefinirSenha");
const inputNovaSenha = document.getElementById("inputNovaSenha");
const inputConfirmaSenha = document.getElementById("inputConfirmaSenha");
const erroNovaSenha = document.getElementById("erroNovaSenha");

// ELEMENTOS DOM - REGISTRO DE PONTO
const inputCpf = document.getElementById("inputCpf");
const formIdentificaPromotor = document.getElementById("formIdentificaPromotor");
const areaConfirmacaoPonto = document.getElementById("areaConfirmacaoPonto");
const labelNomePromotor = document.getElementById("labelNomePromotor");
const labelFornecedorPromotor = document.getElementById("labelFornecedorPromotor");
const labelEmpresaPromotor = document.getElementById("labelEmpresaPromotor");
const inputPinPromotor = document.getElementById("inputPinPromotor");
const msgAjudaPin = document.getElementById("msgAjudaPin");
const btnEntrada = document.getElementById("btnEntrada");
const btnSaida = document.getElementById("btnSaida");
const btnCancelarPonto = document.getElementById("btnCancelarPonto");
const badgePendentes = document.getElementById("badgePendentes");
const listaUltimasBatidas = document.getElementById("listaUltimasBatidas");

// ELEMENTOS DOM - CADASTRO DE PROMOTOR
const modalCadastro = document.getElementById("modalCadastro");
const btnAbrirModalCadastro = document.getElementById("btnAbrirModalCadastro");
const btnFecharModalCadastro = document.getElementById("btnFecharModalCadastro");
const btnCancelarCadastro = document.getElementById("btnCancelarCadastro");
const formCadastroPromotor = document.getElementById("formCadastroPromotor");

// ==========================================
// 1. BANCO DE DADOS LOCAL (IndexedDB v3)
// ==========================================
function inicializarIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("PontoPromotoresDB", 3);
    request.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("promotores")) {
        d.createObjectStore("promotores", { keyPath: "cpf" });
      }
      if (!d.objectStoreNames.contains("batidas")) {
        const store = d.createObjectStore("batidas", { keyPath: "id_registro" });
        store.createIndex("sincronizado", "sincronizado", { unique: false });
        store.createIndex("loja", "loja", { unique: false });
      }
      if (!d.objectStoreNames.contains("usuarios_lojas")) {
        d.createObjectStore("usuarios_lojas", { keyPath: "usuario" });
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };
    request.onerror = (e) => reject(e);
  });
}

// ==========================================
// 2. GESTÃO DE SESSÃO DA LOJA
// ==========================================
function checarSessaoLoja() {
  if (lojaAutenticada && lojaAutenticada.usuario) {
    cardLoginLoja.classList.add("hidden");
    cardRegistroPonto.classList.remove("hidden");
    painelLojaConectada.classList.remove("hidden");
    labelNomeLoja.innerText = `${lojaAutenticada.loja} (${lojaAutenticada.nome_loja})`;
    carregarUltimasBatidas();
    sincronizarDadosNuvem();
  } else {
    cardLoginLoja.classList.remove("hidden");
    cardRegistroPonto.classList.add("hidden");
    painelLojaConectada.classList.add("hidden");
    localStorage.removeItem("loja_autenticada");
    lojaAutenticada = null;
  }
}

formLoginLoja.addEventListener("submit", async (e) => {
  e.preventDefault();
  const usuarioDigitado = inputUsuarioLoja.value.trim().toLowerCase();
  const senhaDigitada = inputSenhaLoja.value.trim();

  const tx = db.transaction("usuarios_lojas", "readonly");
  const req = tx.objectStore("usuarios_lojas").get(usuarioDigitado);

  req.onsuccess = () => {
    const loja = req.result;
    if (loja && loja.senha === senhaDigitada) {
      erroLoginLoja.classList.add("hidden");

      // Detecção de Primeiro Acesso
      if (loja.primeiro_acesso === "SIM") {
        lojaAutenticada = loja;
        modalRedefinirSenha.classList.remove("hidden");
        inputNovaSenha.focus();
        return;
      }

      lojaAutenticada = loja;
      localStorage.setItem("loja_autenticada", JSON.stringify(loja));
      inputUsuarioLoja.value = "";
      inputSenhaLoja.value = "";
      checarSessaoLoja();
    } else {
      erroLoginLoja.classList.remove("hidden");
    }
  };
});

// AÇÃO DE REDEFINIÇÃO DE SENHA NO PRIMEIRO ACESSO
formRedefinirSenha.addEventListener("submit", async (e) => {
  e.preventDefault();
  const n1 = inputNovaSenha.value.trim();
  const n2 = inputConfirmaSenha.value.trim();

  if (n1 !== n2) {
    erroNovaSenha.classList.remove("hidden");
    return;
  }

  erroNovaSenha.classList.add("hidden");
  lojaAutenticada.senha = n1;
  lojaAutenticada.primeiro_acesso = "NAO";

  // Atualização local no IndexedDB
  const tx = db.transaction("usuarios_lojas", "readwrite");
  tx.objectStore("usuarios_lojas").put(lojaAutenticada);

  tx.oncomplete = async () => {
    localStorage.setItem("loja_autenticada", JSON.stringify(lojaAutenticada));
    modalRedefinirSenha.classList.add("hidden");
    alert("Senha alterada com sucesso!");

    // Atualização remota no Google Sheets
    try {
      await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          acao: "alterar_senha_loja",
          usuario: lojaAutenticada.usuario,
          nova_senha: n1
        })
      });
    } catch (err) {
      console.warn("Nuvem inacessível. Senha mantida localmente.");
    }

    inputUsuarioLoja.value = "";
    inputSenhaLoja.value = "";
    checarSessaoLoja();
  };
});

btnDesconectarLoja.addEventListener("click", () => {
  if (confirm("Deseja sair do terminal desta loja?")) {
    localStorage.removeItem("loja_autenticada");
    lojaAutenticada = null;
    checarSessaoLoja();
  }
});

// ==========================================
// 3. SINCRONIZAÇÃO COMPLETA (doGet)
// ==========================================
async function sincronizarDadosNuvem() {
  try {
    const res = await fetch(API_URL);
    const json = await res.json();
    if (json.status === "sucesso") {
      // Salva Promotores
      if (Array.isArray(json.promotores)) {
        const txP = db.transaction("promotores", "readwrite");
        const storeP = txP.objectStore("promotores");
        json.promotores.forEach(p => storeP.put(p));
      }
      // Salva Usuários de Lojas (com estrutura de 5 colunas)
      if (Array.isArray(json.usuarios_lojas)) {
        const txU = db.transaction("usuarios_lojas", "readwrite");
        const storeU = txU.objectStore("usuarios_lojas");
        json.usuarios_lojas.forEach(u => storeU.put(u));
      }
    }
  } catch (e) {
    console.log("Modo offline ativo.");
  }
}

// ==========================================
// 4. BATIDAS E ÚLTIMAS MOVIMENTAÇÕES
// ==========================================
inputCpf.addEventListener("input", (e) => {
  let v = e.target.value.replace(/\D/g, "");
  v = v.replace(/(\d{3})(\d)/, "$1.$2");
  v = v.replace(/(\d{3})(\d)/, "$1.$2");
  v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  e.target.value = v;
});

formIdentificaPromotor.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cpfLimpo = inputCpf.value.replace(/\D/g, "");
  if (cpfLimpo.length !== 11) {
    alert("Digite um CPF válido com 11 dígitos.");
    return;
  }

  const tx = db.transaction("promotores", "readonly");
  const store = tx.objectStore("promotores");
  const req = store.get(cpfLimpo);

  req.onsuccess = () => {
    const promotor = req.result;
    if (!promotor) {
      alert("Promotor não encontrado localmente. Faça o cadastro primeiro no botão acima.");
      return;
    }

    promotorSelecionado = promotor;
    labelNomePromotor.innerText = promotor.nome;
    labelFornecedorPromotor.innerText = promotor.fornecedor;
    labelEmpresaPromotor.innerText = promotor.empresa_terceira || "DIRETO";

    if (!promotor.pin) {
      msgAjudaPin.innerText = "Primeiro acesso: Crie um PIN de 4 dígitos para suas batidas.";
    } else {
      msgAjudaPin.innerText = "Digite seu PIN de 4 dígitos cadastrado.";
    }

    areaConfirmacaoPonto.classList.remove("hidden");
    inputPinPromotor.value = "";
    inputPinPromotor.focus();
  };
});

btnCancelarPonto.addEventListener("click", () => {
  promotorSelecionado = null;
  areaConfirmacaoPonto.classList.add("hidden");
  inputCpf.value = "";
  inputPinPromotor.value = "";
});

async function gravarBatida(tipo) {
  if (!promotorSelecionado) return;
  const pinDigitado = inputPinPromotor.value.trim();

  if (pinDigitado.length !== 4) {
    alert("O PIN deve conter exatamente 4 números.");
    return;
  }

  if (!promotorSelecionado.pin) {
    promotorSelecionado.pin = pinDigitado;
    const txP = db.transaction("promotores", "readwrite");
    txP.objectStore("promotores").put(promotorSelecionado);
    enviarPinNuvem(promotorSelecionado.cpf, pinDigitado);
  } else if (promotorSelecionado.pin !== pinDigitado) {
    alert("PIN incorreto! Tente novamente.");
    return;
  }

  const agora = new Date();
  const dataFormatada = agora.toLocaleDateString("pt-BR");
  const horaFormatada = agora.toLocaleTimeString("pt-BR");

  const registro = {
    id_registro: "BAT_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    data: dataFormatada,
    hora: horaFormatada,
    loja: lojaAutenticada.loja, // Grava padronizado: "Loja 01", "Loja 13", etc.
    cpf: promotorSelecionado.cpf,
    nome: promotorSelecionado.nome,
    fornecedor: promotorSelecionado.fornecedor,
    empresa_terceira: promotorSelecionado.empresa_terceira || "DIRETO",
    tipo_batida: tipo,
    sincronizado: 0
  };

  const tx = db.transaction("batidas", "readwrite");
  tx.objectStore("batidas").add(registro);

  tx.oncomplete = () => {
    alert(`Batida de ${tipo} registrada com sucesso!\n${promotorSelecionado.nome} - ${horaFormatada}`);
    btnCancelarPonto.click();
    atualizarContadorPendentes();
    carregarUltimasBatidas();
    processarFilaEnvio();
  };
}

btnEntrada.addEventListener("click", () => gravarBatida("ENTRADA"));
btnSaida.addEventListener("click", () => gravarBatida("SAIDA"));

// ==========================================
// 5. CADASTRO DE PROMOTOR
// ==========================================
btnAbrirModalCadastro.addEventListener("click", () => modalCadastro.classList.remove("hidden"));
btnFecharModalCadastro.addEventListener("click", () => modalCadastro.classList.add("hidden"));
btnCancelarCadastro.addEventListener("click", () => modalCadastro.classList.add("hidden"));

formCadastroPromotor.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cpf = document.getElementById("cadCpf").value.replace(/\D/g, "");
  const nome = document.getElementById("cadNome").value.trim();
  const empresa = document.getElementById("cadEmpresa").value.trim() || "DIRETO";
  const fornecedor = document.getElementById("cadFornecedor").value.trim();

  if (cpf.length !== 11) {
    alert("CPF inválido.");
    return;
  }

  const novoPromotor = {
    cpf: cpf,
    nome: nome,
    empresa_terceira: empresa,
    fornecedor: fornecedor,
    pin: ""
  };

  const tx = db.transaction("promotores", "readwrite");
  tx.objectStore("promotores").put(novoPromotor);

  tx.oncomplete = async () => {
    modalCadastro.classList.add("hidden");
    formCadastroPromotor.reset();
    alert("Promotor cadastrado com sucesso!");

    try {
      await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ acao: "cadastrar_promotor", promotor: novoPromotor })
      });
    } catch (err) {}
  };
});

async function enviarPinNuvem(cpf, pin) {
  try {
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ acao: "cadastrar_pin", cpf: cpf, pin: pin })
    });
  } catch (e) {}
}

async function processarFilaEnvio() {
  if (!navigator.onLine) return;
  const tx = db.transaction("batidas", "readonly");
  const store = tx.objectStore("batidas");
  const req = store.getAll();

  req.onsuccess = async () => {
    const pendentes = (req.result || []).filter(b => b.sincronizado === 0);
    if (pendentes.length === 0) {
      atualizarContadorPendentes();
      return;
    }

    try {
      await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(pendentes)
      });

      const txUp = db.transaction("batidas", "readwrite");
      const storeUp = txUp.objectStore("batidas");
      pendentes.forEach(b => {
        b.sincronizado = 1;
        storeUp.put(b);
      });
      txUp.oncomplete = () => atualizarContadorPendentes();
    } catch (e) {}
  };
}

function atualizarContadorPendentes() {
  const tx = db.transaction("batidas", "readonly");
  const store = tx.objectStore("batidas");
  const req = store.getAll();
  req.onsuccess = () => {
    const total = (req.result || []).filter(b => b.sincronizado === 0).length;
    if (total > 0) {
      badgePendentes.innerText = `${total} pendente${total > 1 ? "s" : ""}`;
      badgePendentes.classList.remove("hidden");
    } else {
      badgePendentes.classList.add("hidden");
    }
  };
}

function carregarUltimasBatidas() {
  if (!lojaAutenticada) return;
  const tx = db.transaction("batidas", "readonly");
  const store = tx.objectStore("batidas");
  const req = store.getAll();

  req.onsuccess = () => {
    const batidasDaLoja = (req.result || [])
      .filter(b => b.loja === lojaAutenticada.loja)
      .slice(-5)
      .reverse();

    listaUltimasBatidas.innerHTML = "";
    if (batidasDaLoja.length === 0) {
      listaUltimasBatidas.innerHTML = '<li class="text-slate-400 text-center py-2">Nenhuma batida registrada recentemente nesta loja.</li>';
      return;
    }

    batidasDaLoja.forEach(b => {
      const cpfMascarado = b.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "***.$2.$3-**");
      const badgeCor = b.tipo_batida === "ENTRADA" 
        ? "bg-emerald-100 text-emerald-800 border-emerald-200" 
        : "bg-rose-100 text-rose-800 border-rose-200";

      const li = document.createElement("li");
      li.className = "flex justify-between items-center bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl";
      li.innerHTML = `
        <div>
          <p class="font-bold text-slate-800">${b.nome}</p>
          <p class="text-[11px] text-slate-400">${cpfMascarado} • ${b.fornecedor}</p>
        </div>
        <div class="text-right">
          <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${badgeCor}">${b.tipo_batida}</span>
          <p class="text-[11px] font-mono text-slate-500 mt-0.5">${b.hora}</p>
        </div>
      `;
      listaUltimasBatidas.appendChild(li);
    });
  };
}

// INICIALIZAÇÃO DA APLICAÇÃO
window.addEventListener("DOMContentLoaded", async () => {
  await inicializarIndexedDB();
  await sincronizarDadosNuvem();
  checarSessaoLoja();
  atualizarContadorPendentes();
  setInterval(processarFilaEnvio, 30000);
});
