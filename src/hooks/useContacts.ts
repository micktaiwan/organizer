import { useState, useEffect } from "react";
import { load } from "@tauri-apps/plugin-store";
import { Contact } from "../types";
import { STORAGE_KEYS } from "../constants";

export const useContacts = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const initStore = async () => {
      const store = await load("settings.json", { autoSave: true, defaults: {} });
      
      // Try to migrate from localStorage if store is empty
      let storedContacts = await store.get<Contact[]>(STORAGE_KEYS.contacts);
      
      if (!storedContacts) {
        const localData = localStorage.getItem(STORAGE_KEYS.contacts);
        if (localData) {
          try {
            storedContacts = JSON.parse(localData).map((c: any) => ({
              ...c,
              createdAt: new Date(c.createdAt),
            }));
            await store.set(STORAGE_KEYS.contacts, storedContacts);
          } catch (e) {
            console.error("Failed to migrate contacts from localStorage", e);
          }
        }
      } else {
        // Fix dates from JSON
        storedContacts = storedContacts.map(c => ({
          ...c,
          createdAt: new Date(c.createdAt)
        }));
      }

      setContacts(storedContacts || []);
      setIsLoaded(true);
    };

    initStore();
  }, []);

  const saveContacts = async (newContacts: Contact[]) => {
    const store = await load("settings.json", { autoSave: true, defaults: {} });
    await store.set(STORAGE_KEYS.contacts, newContacts);
    setContacts(newContacts);
  };

  const addContact = (name: string, peerId: string) => {
    const newContact: Contact = {
      id: crypto.randomUUID(),
      name: name.trim(),
      peerId: peerId.trim(),
      createdAt: new Date(),
    };
    const updated = [...contacts, newContact];
    saveContacts(updated);
    return newContact;
  };

  const updateContact = (id: string, name: string, peerId: string) => {
    const updated = contacts.map((c) =>
      c.id === id ? { ...c, name: name.trim(), peerId: peerId.trim() } : c
    );
    saveContacts(updated);
  };

  const deleteContact = (id: string) => {
    const updated = contacts.filter((c) => c.id !== id);
    saveContacts(updated);
  };

  return {
    contacts,
    isLoaded,
    addContact,
    updateContact,
    deleteContact,
    getContactName: (peerId: string) => contacts.find(c => c.peerId === peerId)?.name || null,
    isPeerSaved: (peerId: string) => contacts.some(c => c.peerId === peerId)
  };
};

