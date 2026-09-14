"use client";

import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import { useAuthStore } from "@/lib/store/auth";
import { useLanguage } from "@/lib/store/language";
import * as api from "@/lib/api";
import type { Address } from "@/lib/types";

function AddressesBody() {
  const token = useAuthStore((s) => s.token)!;
  const { t } = useLanguage();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ address_type: "Home", address: "", latitude: "", longitude: "", contact_person_number: "" });
  const [saving, setSaving] = useState(false);

  function load() {
    api.getAddresses(token).then(setAddresses).catch(() => setAddresses([]));
  }
  useEffect(load, [token]);

  async function save() {
    setSaving(true);
    try {
      await api.addAddress(token, form);
      setForm({ address_type: "Home", address: "", latitude: "", longitude: "", contact_person_number: "" });
      setShowForm(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    setAddresses((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
    await api.removeAddress(token, id).catch(load);
  }

  return (
    <div className="max-w-[700px] mx-auto px-5 py-10 am-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-am-text">{t("account.myAddresses")}</h1>
        <button onClick={() => setShowForm((v) => !v)} className="bg-am-primary text-white text-[13px] font-semibold px-4 py-2 rounded-full">
          {showForm ? t("common.cancel") : t("account.addAddress")}
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-am-border rounded-2xl p-5 mb-6 flex flex-col gap-3">
          <input placeholder={t("checkout.addressType")} value={form.address_type} onChange={(e) => setForm((f) => ({ ...f, address_type: e.target.value }))} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
          <input placeholder={t("checkout.fullAddress")} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder={t("checkout.latitude")} value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
            <input placeholder={t("checkout.longitude")} value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <input placeholder={t("checkout.contactPhone")} value={form.contact_person_number} onChange={(e) => setForm((f) => ({ ...f, contact_person_number: e.target.value }))} className="border border-am-border rounded-lg px-3 py-2 text-sm" />
          <button onClick={save} disabled={saving} className="bg-am-primary text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50">{saving ? t("common.saving") : t("checkout.saveAddress")}</button>
        </div>
      )}

      {addresses === null ? (
        <p className="text-am-text-muted text-sm">{t("common.loading")}</p>
      ) : addresses.length === 0 ? (
        <p className="text-am-text-muted text-sm text-center py-10">{t("account.noSavedAddresses")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {addresses.map((a) => (
            <div key={a.id} className="flex items-center justify-between bg-white border border-am-border rounded-xl p-4">
              <div>
                <div className="font-semibold text-sm">{a.address_type}</div>
                <div className="text-[13px] text-am-text-muted">{a.address}</div>
              </div>
              <button onClick={() => remove(a.id)} className="text-am-error text-xs font-semibold hover:underline">{t("common.remove")}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AddressesPage() {
  return (
    <RequireAuth>
      <AddressesBody />
    </RequireAuth>
  );
}
