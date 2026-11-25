// CONFIGURAÇÕES GERAIS
const API_URL = "https://script.google.com/macros/s/AKfycby6v5BhdopQZkVY1Rpxm-J9qOnD7N8ud14zhGwjsdeZFJ9PD76ANtfpPSC7Sp7Q0AzpGA/exec";

// ESTADO GLOBAL DA APLICAÇÃO
let db;
let lojaAutenticada = JSON.parse(localStorage.getItem("loja_autenticada") || "null");
let promotorSelecionado = null;
let proximoTipoEsperado = "ENTRADA";
let sincronizacaoEmAndamento = false;

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
const btnAvancar = document.getElementById("btnAvancar");
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
const btnLimparCadastro = document.getElementById("btnLimparCadastro");
const formCadastroPromotor = document.getElementById("formCadastroPromotor");
const cadCpf = document.getElementById("cadCpf");
const cadNome = document.getElementById("cadNome");
const checkDireto = document.getElementById("checkDireto");
const cadEmpresa = document.getElementById("cadEmpresa");
const cadFornecedor = document.getElementById("cadFornecedor");

// ==========================================
// FUNÇÕES AUXILIARES DE FORMATAÇÃO E VALIDAÇÃO
// ==========================================
function formatarCpfString(valor) {
  let v = String(valor || "").replace(/\D/g, "");
  if (v.length > 11) v = v.substring(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return v.replace(/(\d{3})(\d+)/, "$1.$2");
  if (v.length <= 9) return v.replace(/(\d{3})(\d{3})(\d+)/, "$1.$2.$3");
  return v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
}

function handlerMascaraCpf(e) {
  e.target.value = formatarCpfString(e.target.value);
}

function validarDigitosCpf(cpf) {
  cpf = String(cpf).replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.substring(9, 10))) return false;
  soma = 0;
  for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(cpf.substring(10, 11));
}

function atualizarEstadoCampoEmpresa() {
  if (checkDireto.checked) {
    cadEmpresa.value = "DIRETO";
    cadEmpresa.disabled = true;
    cadEmpresa.classList.add("bg-slate-100", "text-slate-400", "cursor-not-allowed");
    cadFornecedor.focus();
  } else {
    cadEmpresa.disabled = false;
    cadEmpresa.classList.remove("bg-slate-100", "text-slate-400", "cursor-not-allowed");
    if (cadEmpresa.value === "DIRETO") {
      cadEmpresa.value = "";
    }
    cadEmpresa.focus();
  }
}

// Máscara dinâmica nos campos de CPF
[inputCpf, cadCpf].forEach(campo => {
  if (campo) {
    campo.addEventListener("input", handlerMascaraCpf);
    campo.addEventListener("keyup", handlerMascaraCpf);
    campo.addEventListener("paste", () => {
      setTimeout(() => { campo.value = formatarCpfString(campo.value); }, 10);
    });
  }
});

// Conversão automática para maiúsculas
[cadNome, cadEmpresa, cadFornecedor].forEach(input => {
  if (input) {
    input.style.textTransform = "uppercase";
    input.addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase();
    });
  }
});

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
        store.createIndex("cpf", "cpf", { unique: false });
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

      if (loja.primeiro_acesso === "SIM") {
        lojaAutenticada = loja;
        inputNovaSenha.value = "";
        inputConfirmaSenha.value = "";
        modalRedefinirSenha.classList.remove("hidden");
        setTimeout(() => { inputNovaSenha.focus(); }, 100);
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

  const tx = db.transaction("usuarios_lojas", "readwrite");
  tx.objectStore("usuarios_lojas").put(lojaAutenticada);

  tx.oncomplete = async () => {
    localStorage.setItem("loja_autenticada", JSON.stringify(lojaAutenticada));
    modalRedefinirSenha.classList.add("hidden");
    inputNovaSenha.value = "";
    inputConfirmaSenha.value = "";
    alert("Senha alterada com sucesso!");

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
// 3. SINCRONIZAÇÃO COMPLETA (ESPELHA PROMOTORES E BATIDAS DO DIA)
// ==========================================
async function sincronizarDadosNuvem() {
  try {
    const res = await fetch(API_URL);
    const json = await res.json();
    if (json.status === "sucesso") {
      // 1. Promotores: limpa e atualiza
      if (Array.isArray(json.promotores)) {
        const txP = db.transaction("promotores", "readwrite");
        const storeP = txP.objectStore("promotores");
        storeP.clear();
        json.promotores.forEach(p => {
          storeP.put({
            cpf: String(p.cpf).replace(/\D/g, ""),
            nome: String(p.nome || "").toUpperCase().trim(),
            empresa_terceira: String(p.empresa_terceira || "DIRETO").toUpperCase().trim(),
            fornecedor: String(p.fornecedor || "").toUpperCase().trim(),
            pin: String(p.pin || "").trim()
          });
        });
      }

      // 2. Lojas: limpa e atualiza
      if (Array.isArray(json.usuarios_lojas)) {
        const txU = db.transaction("usuarios_lojas", "readwrite");
        const storeU = txU.objectStore("usuarios_lojas");
        storeU.clear();
        json.usuarios_lojas.forEach(u => storeU.put(u));
      }

      // 3. Batidas do Dia: espelha a nuvem preservando registros não sincronizados
      if (Array.isArray(json.batidas)) {
        const txB = db.transaction("batidas", "readwrite");
        const storeB = txB.objectStore("batidas");
        const reqB = storeB.getAll();

        reqB.onsuccess = () => {
          const locaisNaoSincronizadas = (reqB.result || []).filter(b => b.sincronizado === 0);
          storeB.clear(); // Limpa histórico antigo local

          // Regrava histórico validado vindo da nuvem
          json.batidas.forEach(b => storeB.put(b));

          // Recoloca batidas offline pendentes se houver
          locaisNaoSincronizadas.forEach(b => storeB.put(b));

          carregarUltimasBatidas();
          atualizarContadorPendentes();
        };
      }
    }
  } catch (e) {
    console.log("Modo offline ativo.");
  }
}

// ==========================================
// 4. IDENTIFICAÇÃO E VALIDAÇÃO DE PONTO
// ==========================================
formIdentificaPromotor.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cpfLimpo = inputCpf.value.replace(/\D/g, "");
  if (!validarDigitosCpf(cpfLimpo)) {
    alert("Digite um CPF válido com 11 dígitos.");
    return;
  }

  const txP = db.transaction("promotores", "readonly");
  const reqP = txP.objectStore("promotores").get(cpfLimpo);

  reqP.onsuccess = () => {
    const promotor = reqP.result;
    if (!promotor) {
      alert("Promotor não encontrado localmente. Faça o cadastro primeiro no botão acima.");
      return;
    }

    promotorSelecionado = promotor;
    labelNomePromotor.innerText = promotor.nome;
    labelFornecedorPromotor.innerText = promotor.fornecedor;
    labelEmpresaPromotor.innerText = promotor.empresa_terceira || "DIRETO";

    const txB = db.transaction("batidas", "readonly");
    const reqB = txB.objectStore("batidas").getAll();

    reqB.onsuccess = () => {
      const hoje = new Date().toLocaleDateString("pt-BR");
      const batidasHoje = (reqB.result || []).filter(b => b.cpf === cpfLimpo && b.data === hoje);

      if (batidasHoje.length > 0) {
        const ultima = batidasHoje[batidasHoje.length - 1];
        if (ultima.tipo_batida === "ENTRADA") {
          proximoTipoEsperado = "SAIDA";
          btnEntrada.classList.add("hidden");
          btnSaida.classList.remove("hidden");
          btnSaida.className = "w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-2 rounded-xl text-xs transition";
        } else {
          proximoTipoEsperado = "ENTRADA";
          btnSaida.classList.add("hidden");
          btnEntrada.classList.remove("hidden");
          btnEntrada.className = "w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs transition";
        }
      } else {
        proximoTipoEsperado = "ENTRADA";
        btnSaida.classList.add("hidden");
        btnEntrada.classList.remove("hidden");
        btnEntrada.className = "w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs transition";
      }

      if (!promotor.pin) {
        msgAjudaPin.innerText = `Primeiro acesso: Crie seu PIN para registrar ${proximoTipoEsperado}.`;
      } else {
        msgAjudaPin.innerText = `Confirme seu PIN para registrar ${proximoTipoEsperado}.`;
      }

      btnAvancar.classList.add("hidden");
      areaConfirmacaoPonto.classList.remove("hidden");
      inputPinPromotor.value = "";
      setTimeout(() => { inputPinPromotor.focus(); }, 100);
    };

    reqB.onerror = () => {
      proximoTipoEsperado = "ENTRADA";
      btnAvancar.classList.add("hidden");
      areaConfirmacaoPonto.classList.remove("hidden");
      inputPinPromotor.value = "";
      inputPinPromotor.focus();
    };
  };

  reqP.onerror = () => {
    alert("Erro ao ler banco local. Recarregue a página.");
  };
});

btnCancelarPonto.addEventListener("click", () => {
  promotorSelecionado = null;
  areaConfirmacaoPonto.classList.add("hidden");
  btnAvancar.classList.remove("hidden");
  inputCpf.value = "";
  inputPinPromotor.value = "";
});

async function gravarBatida(tipo) {
  if (!promotorSelecionado) return;

  if (tipo !== proximoTipoEsperado) {
    alert(`Operação negada! O próximo registro obrigatório para este promotor é: ${proximoTipoEsperado}.`);
    return;
  }

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
    inputPinPromotor.value = "";
    inputPinPromotor.focus();
    return;
  }

  const agora = new Date();
  const dataFormatada = agora.toLocaleDateString("pt-BR");
  const horaFormatada = agora.toLocaleTimeString("pt-BR");

  const registro = {
    id_registro: "BAT_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
    data: dataFormatada,
    hora: horaFormatada,
    loja: lojaAutenticada.loja,
    cpf: promotorSelecionado.cpf,
    nome: promotorSelecionado.nome.toUpperCase(),
    fornecedor: promotorSelecionado.fornecedor.toUpperCase(),
    empresa_terceira: (promotorSelecionado.empresa_terceira || "DIRETO").toUpperCase(),
    tipo_batida: tipo,
    origem_registro: "MANUAL",
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
checkDireto.addEventListener("change", atualizarEstadoCampoEmpresa);

btnAbrirModalCadastro.addEventListener("click", () => {
  formCadastroPromotor.reset();
  checkDireto.checked = false;
  atualizarEstadoCampoEmpresa();
  modalCadastro.classList.remove("hidden");
  cadCpf.focus();
});

btnFecharModalCadastro.addEventListener("click", () => modalCadastro.classList.add("hidden"));
btnCancelarCadastro.addEventListener("click", () => modalCadastro.classList.add("hidden"));

btnLimparCadastro.addEventListener("click", () => {
  formCadastroPromotor.reset();
  checkDireto.checked = false;
  atualizarEstadoCampoEmpresa();
  cadCpf.focus();
});

formCadastroPromotor.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cpfLimpo = cadCpf.value.replace(/\D/g, "");
  const nome = cadNome.value.trim().toUpperCase();
  const empresa = checkDireto.checked ? "DIRETO" : (cadEmpresa.value.trim() || "DIRETO").toUpperCase();
  const fornecedor = cadFornecedor.value.trim().toUpperCase();

  if (!validarDigitosCpf(cpfLimpo)) {
    alert("CPF inválido! Verifique o número digitado.");
    cadCpf.focus();
    return;
  }

  if (nome.length < 3) {
    alert("Informe o nome completo do promotor.");
    cadNome.focus();
    return;
  }

  const novoPromotor = {
    cpf: cpfLimpo,
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
    checkDireto.checked = false;
    atualizarEstadoCampoEmpresa();
    alert(`Promotor cadastrado com sucesso:\n${nome}`);

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

// 6. PROCESSAMENTO DE FILA COM TRAVA DE CONCORRÊNCIA
async function processarFilaEnvio() {
  if (!navigator.onLine || sincronizacaoEmAndamento) return;
  sincronizacaoEmAndamento = true;

  try {
    const tx = db.transaction("batidas", "readonly");
    const store = tx.objectStore("batidas");
    const req = store.getAll();

    req.onsuccess = async () => {
      const pendentes = (req.result || []).filter(b => b.sincronizado === 0);
      if (pendentes.length === 0) {
        atualizarContadorPendentes();
        sincronizacaoEmAndamento = false;
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
        txUp.oncomplete = () => {
          atualizarContadorPendentes();
          sincronizacaoEmAndamento = false;
        };
      } catch (e) {
        sincronizacaoEmAndamento = false;
      }
    };

    req.onerror = () => {
      sincronizacaoEmAndamento = false;
    };
  } catch (err) {
    sincronizacaoEmAndamento = false;
  }
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

// 7. FEED RECENTE EXCLUSIVO DO DIA CORRENTE
function carregarUltimasBatidas() {
  if (!lojaAutenticada) return;
  const tx = db.transaction("batidas", "readonly");
  const store = tx.objectStore("batidas");
  const req = store.getAll();

  req.onsuccess = () => {
    const hoje = new Date().toLocaleDateString("pt-BR");

    const batidasDaLojaHoje = (req.result || [])
      .filter(b => b.loja === lojaAutenticada.loja && b.data === hoje)
      .slice(-3)
      .reverse();

    listaUltimasBatidas.innerHTML = "";
    if (batidasDaLojaHoje.length === 0) {
      listaUltimasBatidas.innerHTML = '<li class="text-slate-400 text-center py-1 text-[11px]">Nenhuma batida registrada hoje.</li>';
      return;
    }

    batidasDaLojaHoje.forEach(b => {
      const cpfMascarado = b.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "***.$2.$3-**");
      const badgeCor = b.tipo_batida === "ENTRADA" 
        ? "bg-emerald-100 text-emerald-800 border-emerald-200" 
        : "bg-rose-100 text-rose-800 border-rose-200";

      const li = document.createElement("li");
      li.className = "flex justify-between items-center bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg";
      li.innerHTML = `
        <div class="truncate">
          <p class="font-bold text-slate-800 text-[11px] truncate">${b.nome}</p>
          <p class="text-[10px] text-slate-400">${cpfMascarado} • ${b.fornecedor}</p>
        </div>
        <div class="text-right shrink-0 ml-2">
          <span class="inline-block text-[9px] font-bold px-1.5 py-0.2 rounded border ${badgeCor}">${b.tipo_batida}</span>
          <p class="text-[10px] font-mono text-slate-500">${b.hora}</p>
        </div>
      `;
      listaUltimasBatidas.appendChild(li);
    });
  };
}

// INICIALIZAÇÃO
window.addEventListener("DOMContentLoaded", async () => {
  await inicializarIndexedDB();
  await sincronizarDadosNuvem();
  checarSessaoLoja();
  atualizarContadorPendentes();
  setInterval(processarFilaEnvio, 30000);
  setInterval(carregarUltimasBatidas, 60000);
});
