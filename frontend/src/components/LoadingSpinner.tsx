export default function LoadingSpinner() {
  return (
    <div className="d-flex justify-content-center align-items-center vh-100">
      <div className="spinner-border text-success" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  )
}
