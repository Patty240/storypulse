;; StoryPulse Story NFT Contract
;; A decentralized platform for publishing and sharing stories with audio and visual media

;; Error Codes
(define-constant ERR_UNAUTHORIZED u403)
(define-constant ERR_INVALID_STORY u400)
(define-constant ERR_STORY_NOT_FOUND u404)
(define-constant ERR_INSUFFICIENT_FUNDS u402)

;; Story NFT Trait
;; Trait temporarily commented out for testing
;; (use-trait nft-trait .sip009-nft-trait.sip009-nft-trait)

;; Story Metadata Storage
(define-map stories 
  uint 
  {
    title: (string-utf8 100),
    description: (string-utf8 500),
    audio-cid: (buff 64),
    image-cid: (buff 64),
    creator: principal,
    royalty-percent: uint
  }
)

;; Story Ownership Tracking
(define-non-fungible-token story-nft uint)

;; Story Counter
(define-data-var last-story-id uint u0)

;; Mint a new story NFT
(define-public (mint-story 
  (title (string-utf8 100))
  (description (string-utf8 500))
  (audio-cid (buff 64))
  (image-cid (buff 64))
  (royalty-percent uint)
)
  (begin
    ;; Validate inputs
    (asserts! (and 
      (> (len title) u0) 
      (<= (len title) u100)
    ) (err ERR_INVALID_STORY))
    
    (asserts! (and 
      (>= royalty-percent u0) 
      (<= royalty-percent u100)
    ) (err ERR_INVALID_STORY))
    
    ;; Increment story ID
    (var-set last-story-id (+ (var-get last-story-id) u1))
    (let 
      (
        (new-story-id (var-get last-story-id))
      )
      
      ;; Store story metadata
      (map-set stories new-story-id {
        title: title,
        description: description,
        audio-cid: audio-cid,
        image-cid: image-cid,
        creator: tx-sender,
        royalty-percent: royalty-percent
      })
      
      ;; Mint NFT to creator
      (try! (nft-mint? story-nft new-story-id tx-sender))
      
      (ok new-story-id)
    )
  )
)

;; Transfer story NFT with optional royalty
(define-public (transfer 
  (token-id uint) 
  (sender principal) 
  (recipient principal)
)
  (let 
    (
      (story-metadata (unwrap! (map-get? stories token-id) (err ERR_STORY_NOT_FOUND)))
      (royalty-amount (/ 
        (* (stx-get-balance sender) (get royalty-percent story-metadata)) 
        u100
      ))
    )
    ;; Authorization check
    (asserts! (is-eq tx-sender sender) (err ERR_UNAUTHORIZED))
    
    ;; Transfer NFT
    (try! (nft-transfer? story-nft token-id sender recipient))
    
    ;; Optional royalty transfer to creator
    (if (> royalty-amount u0)
      (try! (stx-transfer? royalty-amount sender (get creator story-metadata)))
      true
    )
    
    (ok true)
  )
)

;; Tip story creator
(define-public (tip-creator 
  (token-id uint) 
  (amount uint)
)
  (let 
    (
      (story-metadata (unwrap! (map-get? stories token-id) (err ERR_STORY_NOT_FOUND)))
      (creator (get creator story-metadata))
    )
    ;; Validate tip amount
    (asserts! (> amount u0) (err ERR_INSUFFICIENT_FUNDS))
    
    ;; Transfer tip to creator
    (try! (stx-transfer? amount tx-sender creator))
    
    (ok true)
  )
)

;; Read-only function to get story details
(define-read-only (get-story-details (token-id uint))
  (map-get? stories token-id)
)

;; Get the owner of a story NFT
(define-read-only (get-owner (token-id uint))
  (nft-get-owner? story-nft token-id)
)

;; Implement SIP009 NFT Trait
(define-read-only (get-last-token-id)
  (var-get last-story-id)
)

(define-read-only (get-token-uri (token-id uint))
  (ok (some "https://storypulse.io/stories/")))