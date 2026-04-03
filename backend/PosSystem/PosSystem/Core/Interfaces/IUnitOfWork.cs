using Microsoft.EntityFrameworkCore.Storage;

namespace PosSystem.Core.Interfaces;

public interface IUnitOfWork
{
    Task<IDbContextTransaction> BeginTransactionAsync();
    Task SaveChangesAsync();
}
