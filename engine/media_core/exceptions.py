class UserCancelledError(Exception):
    """ExcepciÃ³n lanzada cuando el usuario cancela una operaciÃ³n."""
    pass

class LocalRecodeFailedError(Exception):
    """ExcepciÃ³n para un fallo especÃ­fico en la recodificaciÃ³n local."""
    def __init__(self, message, temp_filepath=None):
        super().__init__(message)
        self.temp_filepath = temp_filepath

class PlaylistDownloadError(Exception):
    """ExcepciÃ³n lanzada cuando yt-dlp falla al descargar un Ã­tem de playlist."""
    pass
