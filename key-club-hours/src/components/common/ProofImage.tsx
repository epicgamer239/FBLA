import { useState, useEffect } from "react";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";

// Module-level cache for proof images
const proofImageCache = new Map<string, string>();

interface ProofImageProps {
  submission: {
    id: string;
    proofInFirestore?: boolean;
    imageProofUrl?: string;
    imageProofStoragePath?: string;
  };
  autoLoad?: boolean;
}

export function ProofImage({ submission, autoLoad = false }: ProofImageProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fetchProof = async () => {
    if (imageData) return; // Already loaded

    setLoading(true);
    setError(false);

    try {
      if (submission.proofInFirestore) {
        // Check cache first
        if (proofImageCache.has(submission.id)) {
          setImageData(proofImageCache.get(submission.id)!);
          setLoading(false);
          return;
        }

        // Fetch from Firestore
        const proofDoc = await getDoc(doc(db, "submissionProofs", submission.id));
        if (proofDoc.exists()) {
          const data = proofDoc.data();
          const dataUrl = data?.imageData;
          if (dataUrl) {
            proofImageCache.set(submission.id, dataUrl);
            setImageData(dataUrl);
          } else {
            setError(true);
          }
        } else {
          setError(true);
        }
      } else if (submission.imageProofUrl) {
        // Legacy: Google Drive URL
        setImageData(submission.imageProofUrl);
      } else if (submission.imageProofStoragePath) {
        // Legacy: Firebase Storage - get download URL
        try {
          const url = await getDownloadURL(ref(storage, `proofs/${submission.imageProofStoragePath}`));
          setImageData(url);
        } catch (e) {
          console.error("Error getting storage URL:", e);
          setError(true);
        }
      } else {
        setError(true);
      }
    } catch (err) {
      console.error("Error fetching proof image:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad && submission.proofInFirestore) {
      fetchProof();
    }
  }, [autoLoad, submission.proofInFirestore, submission.id]);

  // Show error state
  if (error) {
    return <span className="text-sm text-muted-foreground">Proof photo unavailable</span>;
  }

  // Show loading state
  if (loading) {
    return <span className="text-sm text-muted-foreground">Loading proof photo…</span>;
  }

  // No image loaded yet and not auto-loaded
  if (!imageData && !autoLoad) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={fetchProof}
      >
        View proof photo
      </Button>
    );
  }

  // Show thumbnail with modal
  if (imageData) {
    return (
      <>
        <img
          src={imageData}
          alt="Proof"
          className="max-w-xs max-h-64 rounded-md border object-cover cursor-pointer"
          onClick={() => setShowModal(true)}
        />
        {showModal && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowModal(false)}
          >
            <img
              src={imageData}
              alt="Proof"
              className="max-w-[90vw] max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  // Empty state
  return <span className="text-sm text-muted-foreground">No proof image on file.</span>;
}
