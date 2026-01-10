import React, { useState } from 'react';
import { ArrowLeft, Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { Label } from '../../services/api';

const LABEL_COLORS = [
  '#808080', // Gray (default)
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
];

interface LabelManagerProps {
  labels: Label[];
  onClose: () => void;
  onCreateLabel: (name: string, color?: string) => Promise<Label | null>;
  onUpdateLabel: (labelId: string, data: { name?: string; color?: string }) => Promise<Label | null>;
  onDeleteLabel: (labelId: string) => Promise<boolean>;
}

export const LabelManager: React.FC<LabelManagerProps> = ({
  labels,
  onClose,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const result = await onCreateLabel(newName.trim(), newColor);
    if (result) {
      setNewName('');
      setNewColor(LABEL_COLORS[0]);
      setIsCreating(false);
    }
  };

  const handleStartEdit = (label: Label) => {
    setEditingId(label._id);
    setEditName(label.name);
    setEditColor(label.color);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;

    const result = await onUpdateLabel(editingId, { name: editName.trim(), color: editColor });
    if (result) {
      setEditingId(null);
      setEditName('');
      setEditColor('');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const handleDelete = async (labelId: string) => {
    const success = await onDeleteLabel(labelId);
    if (success) {
      setShowDeleteConfirm(null);
    }
  };

  return (
    <div className="label-manager">
      {/* Header */}
      <div className="label-manager-header">
        <button className="label-manager-back" onClick={onClose}>
          <ArrowLeft size={20} />
        </button>
        <h2>Gérer les labels</h2>
        <button
          className="label-manager-add"
          onClick={() => setIsCreating(true)}
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Create new label form */}
      {isCreating && (
        <div className="label-manager-form">
          <input
            type="text"
            placeholder="Nom du label"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <div className="label-manager-colors">
            {LABEL_COLORS.map((c) => (
              <button
                key={c}
                className={`label-color-btn ${newColor === c ? 'selected' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <div className="label-manager-form-actions">
            <button onClick={() => setIsCreating(false)}>
              <X size={16} />
              Annuler
            </button>
            <button className="primary" onClick={handleCreate}>
              <Check size={16} />
              Créer
            </button>
          </div>
        </div>
      )}

      {/* Labels list */}
      <div className="label-manager-list">
        {labels.length === 0 && !isCreating && (
          <div className="label-manager-empty">
            <p>Aucun label</p>
            <span>Créez un label avec le bouton +</span>
          </div>
        )}

        {labels.map((label) => (
          <div key={label._id} className="label-manager-item">
            {editingId === label._id ? (
              /* Edit mode */
              <div className="label-manager-edit">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <div className="label-manager-colors">
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`label-color-btn ${editColor === c ? 'selected' : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setEditColor(c)}
                    />
                  ))}
                </div>
                <div className="label-manager-edit-actions">
                  <button onClick={handleCancelEdit}>
                    <X size={16} />
                  </button>
                  <button className="primary" onClick={handleSaveEdit}>
                    <Check size={16} />
                  </button>
                </div>
              </div>
            ) : (
              /* Display mode */
              <>
                <div className="label-manager-item-info">
                  <span
                    className="label-manager-dot"
                    style={{ backgroundColor: label.color }}
                  />
                  <span className="label-manager-name">{label.name}</span>
                </div>
                <div className="label-manager-item-actions">
                  <button onClick={() => handleStartEdit(label)}>
                    <Edit2 size={16} />
                  </button>
                  <button
                    className="danger"
                    onClick={() => setShowDeleteConfirm(label._id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="label-manager-dialog-overlay">
          <div className="label-manager-dialog">
            <h3>Supprimer le label ?</h3>
            <p>Le label sera retiré de toutes les notes associées.</p>
            <div className="label-manager-dialog-actions">
              <button onClick={() => setShowDeleteConfirm(null)}>
                Annuler
              </button>
              <button
                className="danger"
                onClick={() => handleDelete(showDeleteConfirm)}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
