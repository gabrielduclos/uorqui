import { api } from "./lib/api";

type CompanyLookup = {
  name: string;
  legalName: string;
  cnpj: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

const timers = new WeakMap<HTMLInputElement, number>();

function statusFor(input: HTMLInputElement) {
  const label = input.closest("label");
  if (!label) return null;
  let status = label.querySelector<HTMLElement>(".uorqui-cnpj-status");
  if (!status) {
    status = document.createElement("small");
    status.className = "uorqui-cep-status uorqui-cnpj-status";
    label.appendChild(status);
  }
  return status;
}

function setField(form: HTMLFormElement, name: string, value: string, onlyIfEmpty = false) {
  if (!value) return;
  const field = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
  if (!field || (onlyIfEmpty && field.value.trim())) return;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length !== 14) return value;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

async function lookup(input: HTMLInputElement) {
  const digits = input.value.replace(/\D/g, "").slice(0, 14);
  const status = statusFor(input);
  if (digits.length !== 14) {
    if (status) {
      status.textContent = "";
      status.className = "uorqui-cep-status uorqui-cnpj-status";
    }
    return;
  }
  if (input.dataset.uorquiLastCnpj === digits) return;
  input.dataset.uorquiLastCnpj = digits;

  if (status) {
    status.textContent = "Buscando dados da empresa…";
    status.className = "uorqui-cep-status uorqui-cnpj-status";
  }

  try {
    const result = await api<CompanyLookup>(`/cnpj/${digits}`);
    const form = input.closest("form");
    if (!form) return;

    input.value = formatCnpj(result.cnpj || digits);
    setField(form, "name", result.name || result.legalName, true);
    setField(form, "postalCode", result.postalCode);
    setField(form, "street", result.street);
    setField(form, "number", result.number);
    setField(form, "complement", result.complement, true);
    setField(form, "district", result.district);
    setField(form, "city", result.city);
    setField(form, "state", result.state);

    if (status) {
      status.textContent = "CNPJ encontrado. CEP e endereço preenchidos.";
      status.className = "uorqui-cep-status uorqui-cnpj-status ok";
    }
  } catch (error) {
    delete input.dataset.uorquiLastCnpj;
    if (status) {
      status.textContent = error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.";
      status.className = "uorqui-cep-status uorqui-cnpj-status error";
    }
  }
}

document.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.name !== "cnpj") return;
  const previous = timers.get(input);
  if (previous) window.clearTimeout(previous);
  timers.set(input, window.setTimeout(() => void lookup(input), 350));
}, true);

document.addEventListener("blur", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.name === "cnpj") void lookup(input);
}, true);
